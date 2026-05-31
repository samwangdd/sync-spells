# SP-2 · 目录分类 4+2 迁移 + migrate + 完整 globalize(适配 post-SP-1)设计

> Date: 2026-05-31
> Status: Draft
> Scope: SyncSpells 简化重构第二个子项目;基于 v3 设计文档,适配 SP-1 后的"registry 唯一真相 / 无 active-skills"模型

## 背景与对 v3 设计的适配

权威蓝图是 `docs/2026-05-16-skills-registry-v3-design.md`(v3),但 v3 写于 SP-1 之前,**假设 `materialize` + `active-skills` 存在**。SP-1 已删除二者(registry 唯一真相、项目级直链)。SP-2 沿用 v3 的有效核心,做三处适配:

| v3 原设计 | SP-1 后适配 |
|---|---|
| `materialize` 解析 profile → 生成 active-skills/ symlink | **删除**;resolve 产物直接喂给 `ProjectService.activateProfile`(直链 registry) |
| `ResolveService` 服务 materialize | 保留,服务于项目级 `use`(把 categories 展开成 skill 列表) |
| profile resolve 含 `global/` 全量 | **项目级 resolve 排除 `global/`**——global 已由全局层(`spells sync` → `~/.claude/skills → registry/global/`)负责,项目级再链 global 会重复 |

## 核心设计决策

1. **目录 4+2**:`global/ coding/ collaboration/ workflow/ external/ inbox/`。删空壳 `code/`、`root-files/`。
2. **category profile**:`{name, categories[], extras[], extends}`;`migrate` 把现有扁平 `{name, skills[]}` 转换过来。
3. **🔑 项目级 resolve 排除 global**:`resolve(profile)` = extends(递归) + categories 展开 + extras,**不含 global**。理由:global 是全局层职责,项目 `.claude/skills` 只放项目专属(coding/collaboration/workflow/extras)。`global-lite` 这类"只要 global"的 profile → 项目级解析为空(它本就靠全局层)。
4. **`use` 集成**:`runUse` = `resolve(profile)` → `activateProfile(直链 registry)`(复用 SP-1 直链)。
5. **`migrate`**:备份 + 目录重构 + profile 扁平→category 转换 + 验证报告。
6. **完整 `globalize <skill>`**:把 skill 物理移进 `global/` + 更新所有 profile 引用(从 extras/categories 来源移除,因为 global 自动全局)。SP-1 手工做了 task-run,SP-2 做成命令。

## 目录映射(migrate 执行)

| 旧 | 新 |
|---|---|
| `global/*` | `global/*`(不变) |
| `domains/frontend/*`、`domains/figma/*` | `coding/*` |
| `domains/lark/*` | `collaboration/*` |
| `projects/mexc/*`(技术) | `coding/*` |
| `projects/mexc/*`(流程:kickoff/pre-qa/submit-review/worktree-init/jira-*/review-prd/page-removal) | `workflow/*` |
| `projects/lifeos/*`(流程:task-*) | `workflow/*` |
| `projects/lifeos/*`(技术:llm-wiki) | `coding/*` |
| `projects/omf/*` | `workflow/*`(omf 流程类) |
| `workflows/*` | `workflow/*` |
| `external/*`、`inbox/*` | 不变 |
| `code/`、`root-files/`(空壳) | 删除 |

> 技术/流程归类有人工判断成分:`migrate` 输出"建议归类 + 需人工确认"清单,默认按上表,允许 `migrate --dry-run` 预览。

## 组件设计

### 1. 类型(`src/types/index.ts`)
```ts
export interface Profile {
  name: string;
  categories?: string[];   // 全量加载的类别(coding/collaboration/workflow),不含 global
  extras?: string[];       // 个别追加的 registry 相对路径
  extends?: string | null; // 继承另一 profile
  skills?: string[];       // legacy 扁平列表(向后兼容,migrate 前)
}
export type SkillCategory = 'global' | 'coding' | 'collaboration' | 'workflow' | 'external' | 'inbox';
```

### 2. `ResolveService`(新增 `src/services/ResolveService.ts`)
```ts
interface ResolvedProfile { name: string; skills: string[]; sources: { extends: string[]; categories: string[]; extras: string[]; legacy: string[] }; }
class ResolveService {
  constructor(config, profileSvc, skillSvc);
  resolve(profileName: string): Promise<ResolvedProfile>;
}
```
解析顺序(**不含 global**):extends 父 profile 递归(≤5 层,防环) → categories 下所有 skill(扫 registry/<category>/) → extras → legacy `skills[]`(若存在,过滤掉 `global/*`) → 去重(basename,后者覆盖)。

### 3. `migrate` 命令(新增 `src/commands/migrate.ts` + `MigrateService`)
- `--dry-run`:只输出迁移计划,不动文件
- 执行:① 备份 `skills-registry/` → `skills-registry-backup-<date>/`;② 按映射 `git mv`/`mv` 目录;③ profile 扁平→category 转换(启发式:扫每个 skill 新路径所属 category,聚合成 categories;无法整类的进 extras;`global/*` 移除);④ 验证:转换前后每 profile 的"项目级 skill 集"(排除 global 后)一致;⑤ 报告。
- 删空壳 `code/`、`root-files/`。

### 4. 完整 `globalize <skill>`(`src/commands/skill.ts` 的 `globalize` 子命令 + SkillService)
- 解析 skill 当前路径 → `git mv`/`mv` 到 `global/<name>/`
- 更新所有 `profiles/*.json`:从 `extras` 移除该 skill 引用;若该 skill 所在 category 被某 profile 整类加载,加载仍生效(已在 global,自动全局)——无需动 categories
- 冲突:`global/<name>` 已存在 → 报错停止(除非未来 `--force`)

### 5. `resolve` 命令(新增 `src/commands/resolve.ts`)
- `spells resolve <profile>`:打印 ResolvedProfile(调试用)

### 6. `use` 集成(`src/commands/use.ts`)
```ts
const resolved = await resolveSvc.resolve(finalProfile);
return await projectSvc.activateProfile(projectPath, resolved.skills); // 直链 registry
```
> 需把 `activateProfile` 签名从 `(projectPath, profileName)` 调整为接收已解析的 skill 列表,或内部改用 ResolveService。保留对外行为。

### 7. `SkillService.scanCategory` / `listCategories` 适配新目录名;清理 `:61` 的 `!== 'active-skills'` 死 filter(已无 active-skills)。

## 数据流
```
spells use <preset>
  → ResolveService.resolve(preset)         // extends + categories展开 + extras (NO global)
  → ProjectService.activateProfile(resolved.skills)  // 直链 registry/<skillPath>
spells migrate [--dry-run]
  → backup → 目录重构 → profile扁平→category → 验证 → 报告
spells skill globalize <skill>
  → mv skill → global/ → 更新 profile extras 引用
```

## 错误处理
- resolve:extends 循环/超 5 层 → 报错;category 目录不存在 → 跳过并警告;skill 路径不存在 → 标错继续。
- migrate:备份失败 → 终止(不动原目录);目录冲突 → 报告需人工处理;验证不一致 → 报告差异,保留备份。
- globalize:目标已存在 → 停止。

## 测试策略(TDD)
- `ResolveService`:categories 展开、extras 追加、extends 递归、循环检测、去重、**排除 global**、legacy `skills[]` 兼容(过滤 global)。
- `MigrateService`:临时目录端到端——建旧结构 → migrate → 断言新目录 + profile category 格式 + 备份存在 + 验证一致。`--dry-run` 不动文件。
- `globalize`:skill 移动 + profile extras 引用移除 + 目标冲突报错。
- `resolve` 命令输出。
- `use` 集成:resolve→直链,project `.claude/skills` 指向 registry 的 coding/* 等,不含 global。
- 复用 mock homedir + temp dir 模式。

## 验证
1. `npm run build && npm test` 全绿。
2. `spells migrate --dry-run`:输出合理迁移计划。
3. (确认点)真实 `spells migrate`:registry 变 4+2,备份生成,profiles 转 category,`spells resolve mexc-code` 输出含 coding/* 不含 global。
4. `spells use mexc-code`(临时项目):`.claude/skills` 直链 registry 的 coding 等。
5. `spells skill globalize <某 skill>`:移动 + profile 更新正确。

## Non-goals
- 删老 bash / 文档重写 → SP-3
- coding 跨仓库分发 → SP-4
- `external/` 自动加载(仍只经 extras)
- 全局层逻辑(SP-1 已定,不动)

## 成功标准
- [ ] registry 为 4+2 结构,空壳目录删除,备份生成
- [ ] profiles 为 category 格式(categories/extras/extends),legacy 兼容读取
- [ ] `ResolveService` 正确解析(排除 global、extends 递归、去重)
- [ ] `migrate`(含 --dry-run)、`resolve`、完整 `globalize` 命令可用且测试覆盖
- [ ] `use` 经 resolve 直链 registry,项目级不含 global
- [ ] 全套测试绿,真实 migrate + use + globalize 验证通过
