# SP-1 · 全局物理接管 + 废除 active-skills（registry 唯一真相）设计

> Date: 2026-05-31
> Status: Draft (待用户审阅)
> Scope: SyncSpells 简化重构的第一个子项目

## 背景

SyncSpells 当前处于「两代实现并存 + 半迁移」状态,复杂度高。一轮结构探查发现两个互相纠缠的根因:

**根因 1 · 新 CLI 不接管全局活链。** `spells` 的命令都不维护 `~/.claude/skills`:
- `materialize <profile>` 只生成 `active-skills/<profile>/`,不碰 `~/.claude/skills`
- `sync` 的 mapping 是 `skills → skills`(`source=skills-registry`),指向不存在的 `skills-registry/skills` → 永远 skipped
- `use` 只管项目级

当前真正加载全局 skill 的活链是老 `setup.sh` 的遗产:
```
~/.claude/skills → iCloud/sync-spells/skills → active-skills/global-lite
~/.agents/skills → (同一中转) → active-skills/global-lite
```

**根因 2 · skills-registry 与 active-skills 边界模糊。** `active-skills/` 是旧「profile 驱动(X)」模型的产物。在项目级激活里,它是个**多余的双跳中转**:
```
项目/.claude/skills/<s> → active-skills/<profile>/<s> → skills-registry/<category>/<s>
                          └────────── 多余中转 ──────────┘
```
`ProjectService` 手里本就有 registry 相对路径,完全可以直链 registry,跳过 active-skills。

→ SP-1 一次性解决两者,确立 **registry 为唯一真相**,active-skills 整个废除。

## 在整体分解中的位置

```
SP-1 · 全局物理接管 + 废除 active-skills   ← 本 spec,根 blocker
SP-2 · 目录分类 v3 迁移 + migrate
SP-3 · 概念精简 + 文档/UX + 删老 bash
SP-4 · coding 跨仓库分发 (^1101)
```

## 设计目标

1. `spells sync` 驱动全部启用工具的全局 skills 软链 → `skills-registry/global/`。
2. 全局内容 = `global/` 分类本身(稳定,不随 profile 变)。
3. 项目级激活直链 registry,废除 active-skills 双跳中转。
4. 删除 `materialize` / `MaterializeService` / `active-skills/` / `resolveActiveSkillsDir` / `config.activeDir`、`config.cacheDir`。
5. 退役 `setup.sh` 的建链职责(物理删除留 SP-3)。
6. 全程不破坏当前正在工作的 skill 加载。

## 核心设计决策(已与用户确认)

| 维度 | 决策 |
|---|---|
| 内容模型 | **Y · 分类驱动** —— 全局固定挂 `skills-registry/global/`,profile/preset 只管项目级 |
| 接管粒度 | **A · 目录级独占** —— 工具 `skills` 路径整体软链到 `global/` |
| 挂载机制 | **① 逐工具直挂** —— 直接软链,无中转无 cache |
| 工具范围 | **四个全接管** —— claude-code、agents、codex、cursor |
| config 模型 | **方案 a** —— 复用 `from/to` mapping(`global → skills`),`sync` 逻辑不动 |
| active-skills | **整个废除** —— registry 唯一真相;全局直挂 + 项目级直链 |
| 命令 | `sync` 不变;**删 `materialize`** |

## 两个 workstream

### Workstream A · 全局物理接管

#### A1. config 数据形态

`source` 不变(`skills-registry`)。`config.tools` 收敛为四工具,各一条 mapping:

```json
{
  "claude-code": { "enabled": true, "configPath": "~/.claude", "mappings": [{ "from": "global", "to": "skills" }] },
  "agents":      { "enabled": true, "configPath": "~/.agents", "mappings": [{ "from": "global", "to": "skills" }] },
  "codex":       { "enabled": true, "configPath": "~/.codex",  "mappings": [{ "from": "global", "to": "skills" }] },
  "cursor":      { "enabled": true, "configPath": "~/.cursor", "mappings": [{ "from": "global", "to": "skills" }] }
}
```

删掉 claude-code 原有的 `commands→commands`/`skills→skills`/`agents→agents`。`tool-presets.ts` 同步:改 mappings + 新增 `agents` preset;`kiro` 保留定义不默认启用。

#### A2. 现有 `sync` 状态机已覆盖全部迁移

`runSync()` 对每条 `mapping{from,to}` 跑 `checkSymlinkState` → missing 建链 / real-dir backup+换链 / wrong-target 重链 / linked skip。改 mapping 为 `global → skills` 后:

| 工具现状 | 判定 | 动作 |
|---|---|---|
| `~/.claude/skills` → active-skills/global-lite | `wrong-target` | 重链 → `global/` |
| `~/.agents/skills` → 同上 | `wrong-target` | 重链 → `global/` |
| `~/.codex/skills` 真实目录(有内容) | `real-dir` | **backup 后**换链 |
| `~/.cursor/skills` 不存在 | `missing` | 建链 |

→ A workstream **不新增命令、不改 sync 逻辑**,只改 config 数据。

### Workstream B · 废除 active-skills(项目级直链)

#### B1. ProjectService 直链 registry

`ProjectService.activateProfile` 改造:`sourceLink` 从 `active-skills/<profile>/<skill>` 改为 `path.join(config.source, skillPath)`(直接指 registry)。结果:

```
项目/.claude/skills/<skill> → skills-registry/<category>/<skill>   (单跳,无中转)
```

#### B2. use.ts 去掉 materialize

`runUse` 删掉 `await materializeSvc.materialize(finalProfile)`,直接 `projectSvc.activateProfile()`。

#### B3. 删除清单

| 删除 | 文件/符号 |
|---|---|
| 命令 | `src/commands/materialize.ts` + `index.ts` 中的 `registerMaterialize` |
| 服务 | `src/services/MaterializeService.ts` |
| config | `resolveActiveSkillsDir`、`Config.activeDir`、`Config.cacheDir` |
| doctor | `doctor.ts` 的 active-skills check —— **移除**(active-skills 已不存在);全局链健康检查作为可选增强,不在 SP-1 必做 |
| 物理目录 | iCloud `sync-spells/active-skills/`(**迁移完成后**删) |

`SkillService` 中 `.filter(... !== 'active-skills')` 可一并清理(registry 下不再有该目录)。

### lifeos skill 的内容差异处理

全局从 `global-lite`(18 项)切到 `global/`(38 项)后,2 个 lifeos skill 因物理在 `projects/lifeos/` 而从全局消失:
- **`task-run`** → SP-1 内手动 globalize:物理移 `projects/lifeos/task-run/` → `global/task-run/`,更新所有 profile 引用(`projects/lifeos/task-run` → `global/task-run`)。完整 globalize 机制留 SP-2。
- **`jira-daily-worklog`** → 接受降为项目级(后续项目级 `use` 加载),不移动。

## 数据流

```
全局:  spells sync → 每个 enabled tool: registry/global ⇒ 工具/skills（目录级软链）
项目:  spells use <preset> → activateProfile → 每个 profile.skill: registry/<skillPath> ⇒ 项目/.claude(.codex)/skills/<skill>（逐 skill 直链）
```

## 迁移顺序(关键,避免断当前活链)

1. `spells doctor` 快照四工具 skills 链现状(回滚依据)。
2. globalize `task-run`(移目录 + 改 profile 引用)。
3. `npm run build` → `spells sync`:四工具 skills 重链到 `global/`(此时全局活链已脱离 active-skills)。
4. 验证全局加载正常后,**才**物理删除 `active-skills/` 目录。
5. `setup.sh` 标注废弃 + 注释指向 `spells sync`(物理删除留 SP-3)。

## 错误处理

| 场景 | 行为 |
|---|---|
| `source/global` 不存在 | 报错停止 |
| `real-dir` backup 失败 | 停在该工具,不删原目录,报错 |
| 工具 configPath 父目录不可写 | 报错该工具,继续其余 |
| `global/` 空目录 | 警告但继续 |
| 项目级某 skill 在 registry 不存在 | 该 skill 标 error,继续其余(沿用现有逐 skill error 收集) |

## 测试策略 (TDD)

复用现有 mock `os.homedir()` + temp dir + `jest.resetModules()` 模式。

**Workstream A(sync / config):**
- `global → skills` 四状态:missing 建链 / wrong-target 重链 / real-dir backup+链 / linked skip
- 四工具循环一次处理
- `source/global` 缺失抛错;real-dir 时 `backupPath` 被调
- config 默认值 + tool-presets:四工具 mapping = `global→skills`,含 `agents` preset

**Workstream B(ProjectService / use / 删除):**
- `activateProfile` 红:项目 `.claude/skills/<skill>` 直链到 `registry/<skillPath>`(不含 active-skills 路径段)
- `use` 不再产生 active-skills 目录
- 删除 `MaterializeService.test.ts`、`materialize.test.ts`;改 `use.test.ts` / `ProjectService.test.ts` 断言为直链
- `config.test.ts`:移除 `resolveActiveSkillsDir` / `activeDir` / `cacheDir` 相关用例

## 验证 (verification-before-completion)

1. `npm test` 全绿。
2. ⚠️ **先 `npm run build`** —— `spells` 跑 `dist/`,不 build 验证的是旧代码。
3. 真实 `spells sync`:四工具 skills 均 → `registry/global/`;codex 原目录已 backup;`task-run` 在 `global/` 且全局可用。
4. 真实 `spells use <preset>`(在一个测试项目):`.claude/skills/<skill>` 直链 registry,**无** active-skills 路径段。
5. 确认 iCloud `active-skills/` 删除后,全局与项目加载均正常。
6. 新开 session 确认全局 skill(尤其 `task-run`)正常加载。

## Non-goals(明确不在 SP-1)

- config schema 大改(只删 activeDir/cacheDir,不引入新 schema)→ 余下美化 SP-3
- 物理删除 setup.sh / scripts/*.sh / sync-spells.json / legacy-commands → SP-3
- 目录分类 4+2 迁移、`spells migrate`、完整 `globalize` 命令 → SP-2
- coding skill 跨仓库分发 → SP-4
- 解决 iCloud eviction 风险
- commands / agents 的全局接管(只做 skills)

## 成功标准

- [ ] `spells sync` 把四工具 `skills` 全部软链到 `skills-registry/global/`
- [ ] codex 真实目录安全备份后替换,无数据丢失
- [ ] `task-run` 物理在 `global/`,profile 引用更新,全局可用
- [ ] `spells use` 后项目 `.claude/skills` 直链 registry,无 active-skills 中转
- [ ] `materialize` 命令 / `MaterializeService` / `active-skills/` / `resolveActiveSkillsDir` / `activeDir` / `cacheDir` 全部删除
- [ ] `setup.sh` 标注废弃并指向 `spells sync`
- [ ] 全套 TDD 测试通过,真实 `spells sync` + `spells use` 验证通过
- [ ] 新 session 全局 skill 加载正常
