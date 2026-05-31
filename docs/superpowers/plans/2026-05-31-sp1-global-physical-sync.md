# SP-1 全局物理接管 + 废除 active-skills 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `spells sync` 把四个工具的全局 `skills` 目录软链到 `skills-registry/global/`,并废除 active-skills 双跳中转(项目级直链 registry),确立 registry 为唯一真相。

**Architecture:** 复用现有 `sync` 状态机,仅修正 config 数据(`global → skills`)即可驱动全局接管;`ProjectService` 改为直链 registry,删除 `materialize`/`MaterializeService`/`active-skills`/`resolveActiveSkillsDir`/`activeDir`/`cacheDir`。代码改动全部在 `codeLab/sync-spells`;运行时数据迁移(globalize task-run、重链、删 active-skills 目录)对 iCloud `sync-spells` 仓库,放在代码改完之后。

**Tech Stack:** TypeScript (strict, ES2020, CommonJS), Jest, Commander, Node fs/promises。`spells` 运行 `dist/index.js`(验证前必须 `npm run build`)。

**前置:** 执行前在 `codeLab/sync-spells` 开 feature branch(如 `feat/sp1-global-physical-sync`)。Spec: `docs/superpowers/specs/2026-05-31-sp1-global-physical-sync-design.md`。

---

## 文件结构

| 文件 | 责任 | 动作 |
|---|---|---|
| `src/lib/config.ts` | config schema + 读写 | 改 `defaultConfig`(四工具,`global→skills`);删 `resolveActiveSkillsDir`、`Config.activeDir`、`Config.cacheDir` |
| `src/commands/tool-presets.ts` | 工具预设 | 改 mappings 为 `global→skills`;新增 `agents` preset |
| `src/services/ProjectService.ts` | 项目级激活 | `activateProfile` 直链 registry |
| `src/commands/use.ts` | use 命令 | 去掉 `materialize` 调用 |
| `src/commands/materialize.ts` | materialize 命令 | **删除** |
| `src/services/MaterializeService.ts` | materialize 服务 | **删除** |
| `src/commands/doctor.ts` | 健康检查 | 移除 active-skills check |
| `src/index.ts` | 命令注册 | 移除 `registerMaterialize` |
| `src/types/index.ts` | 类型 | 删除 `MaterializeResult`(若仅 materialize 使用) |
| `__tests__/...` | 测试 | 改 config/use/ProjectService/doctor;删 materialize 两个测试文件 |

执行顺序:**Workstream A**(全局,A1–A2)→ **Workstream B**(废除 active-skills,B1–B6)→ **运行时迁移**(M1–M2)。

---

## Workstream A · 全局物理接管

### Task A1: config defaultConfig 改为四工具 global→skills

**Files:**
- Modify: `src/lib/config.ts:70-88`
- Test: `__tests__/lib/config.test.ts`

- [ ] **Step 1: 改写失败测试**（替换 `config.test.ts` 中 `readConfig returns defaultConfig when config file does not exist` 一项,并新增结构断言）

```ts
test('defaultConfig has four tools each mapping global to skills', async () => {
  const { defaultConfig } = loadConfigModule();
  expect(Object.keys(defaultConfig.tools).sort()).toEqual(
    ['agents', 'claude-code', 'codex', 'cursor'].sort(),
  );
  for (const key of Object.keys(defaultConfig.tools)) {
    const tool = defaultConfig.tools[key];
    expect(tool.enabled).toBe(true);
    expect(tool.mappings).toEqual([{ from: 'global', to: 'skills' }]);
  }
  expect(defaultConfig.tools['claude-code'].configPath).toBe('~/.claude');
  expect(defaultConfig.tools['agents'].configPath).toBe('~/.agents');
  expect(defaultConfig.tools['codex'].configPath).toBe('~/.codex');
  expect(defaultConfig.tools['cursor'].configPath).toBe('~/.cursor');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest __tests__/lib/config.test.ts -t "four tools" -v`
Expected: FAIL（当前 defaultConfig 只有 claude-code/cursor,且 mappings 是 commands/skills/agents）

- [ ] **Step 3: 改 defaultConfig**

```ts
export const defaultConfig: Config = {
  source: '',
  tools: {
    'claude-code': { enabled: true, configPath: '~/.claude', mappings: [{ from: 'global', to: 'skills' }] },
    'agents':      { enabled: true, configPath: '~/.agents', mappings: [{ from: 'global', to: 'skills' }] },
    'codex':       { enabled: true, configPath: '~/.codex',  mappings: [{ from: 'global', to: 'skills' }] },
    'cursor':      { enabled: true, configPath: '~/.cursor', mappings: [{ from: 'global', to: 'skills' }] },
  },
};
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx jest __tests__/lib/config.test.ts -t "four tools" -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/config.ts __tests__/lib/config.test.ts
git commit -m "feat(config): default to four tools mapping global to skills"
```

### Task A2: tool-presets 改 mappings + 新增 agents

**Files:**
- Modify: `src/commands/tool-presets.ts:10-39`
- Test: `__tests__/commands/tool-presets.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, test } from '@jest/globals';
import { TOOL_PRESETS, presetToToolConfig } from '../../src/commands/tool-presets';

describe('TOOL_PRESETS', () => {
  test('claude-code/agents/codex/cursor each map global to skills', () => {
    for (const key of ['claude-code', 'agents', 'codex', 'cursor']) {
      const preset = TOOL_PRESETS.find(p => p.key === key);
      expect(preset).toBeDefined();
      expect(preset!.mappings).toEqual([{ from: 'global', to: 'skills' }]);
    }
  });

  test('agents preset points at ~/.agents', () => {
    const agents = TOOL_PRESETS.find(p => p.key === 'agents');
    expect(agents!.configPath).toBe('~/.agents');
  });

  test('presetToToolConfig enables the tool', () => {
    const preset = TOOL_PRESETS.find(p => p.key === 'claude-code')!;
    expect(presetToToolConfig(preset).enabled).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest __tests__/commands/tool-presets.test.ts -v`
Expected: FAIL（agents 不存在;claude-code mappings 仍是 commands/skills/agents）

- [ ] **Step 3: 改 TOOL_PRESETS**

```ts
export const TOOL_PRESETS: ToolPreset[] = [
  { label: 'Claude Code', key: 'claude-code', configPath: '~/.claude', mappings: [{ from: 'global', to: 'skills' }] },
  { label: 'Agents',      key: 'agents',      configPath: '~/.agents', mappings: [{ from: 'global', to: 'skills' }] },
  { label: 'Codex',       key: 'codex',       configPath: '~/.codex',  mappings: [{ from: 'global', to: 'skills' }] },
  { label: 'Cursor',      key: 'cursor',      configPath: '~/.cursor', mappings: [{ from: 'global', to: 'skills' }] },
  { label: 'Kiro',        key: 'kiro',        configPath: '~/.kiro',   mappings: [{ from: 'global', to: 'skills' }] },
];
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx jest __tests__/commands/tool-presets.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/tool-presets.ts __tests__/commands/tool-presets.test.ts
git commit -m "feat(presets): map global to skills, add agents preset"
```

### Task A3: sync 覆盖 global→skills 四状态（信心测试,不改实现）

**Files:**
- Test: `__tests__/commands/sync.test.ts`（新增一个用例)

- [ ] **Step 1: 写测试**（验证 `wrong-target` 场景——模拟旧活链指向 active-skills 后重链到 global)

```ts
test('runSync re-links global to skills when target points at old active-skills', async () => {
  const { runSync } = loadSyncModule(tempHome);
  const sourceDir = path.join(tempHome, 'source');
  const oldDir = path.join(tempHome, 'active-skills', 'global-lite');
  const toolDir = path.join(tempHome, 'claude');
  mkdirSync(path.join(sourceDir, 'global'), { recursive: true });
  mkdirSync(oldDir, { recursive: true });
  mkdirSync(toolDir, { recursive: true });
  await fs.symlink(oldDir, path.join(toolDir, 'skills')); // wrong-target

  writeTestConfig(tempHome, sourceDir, {
    'claude-code': { enabled: true, configPath: toolDir, mappings: [{ from: 'global', to: 'skills' }] },
  });

  const results = await runSync();
  expect(results).toEqual([
    { tool: 'claude-code', from: 'global', to: 'skills', action: 're-linked' },
  ]);
  const target = await fs.readlink(path.join(toolDir, 'skills'));
  expect(target).toBe(path.join(sourceDir, 'global'));
});
```

- [ ] **Step 2: 跑测试确认通过**（sync 逻辑已支持,应直接 PASS;若失败说明 sync 行为偏离预期,需排查)

Run: `npx jest __tests__/commands/sync.test.ts -t "re-links global to skills" -v`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add __tests__/commands/sync.test.ts
git commit -m "test(sync): cover global->skills re-link from stale active-skills"
```

---

## Workstream B · 废除 active-skills

### Task B1: ProjectService.activateProfile 直链 registry

**Files:**
- Modify: `src/services/ProjectService.ts:52-72`
- Test: `__tests__/services/ProjectService.test.ts`

- [ ] **Step 1: 写失败测试**（追加到 ProjectService.test.ts）

```ts
it('activateProfile links project skills directly to registry (no active-skills hop)', async () => {
  await fs.mkdir(path.join(testDir, 'global', 'git-commit'), { recursive: true });
  await fs.writeFile(path.join(testDir, 'global', 'git-commit', 'SKILL.md'), '# x');
  await fs.mkdir(path.join(testDir, 'profiles'), { recursive: true });
  await fs.writeFile(
    path.join(testDir, 'profiles', 'test.json'),
    JSON.stringify({ name: 'test', skills: ['global/git-commit'] }),
  );

  const cfg: Config = { source: testDir, tools: {}, profilesDir: path.join(testDir, 'profiles') };
  const svc = new ProjectService(cfg, new ProfileService(cfg));
  const projectDir = path.join(testDir, 'proj');

  await svc.activateProfile(projectDir, 'test');

  const target = await fs.readlink(path.join(projectDir, '.claude', 'skills', 'git-commit'));
  expect(target).toBe(path.join(testDir, 'global', 'git-commit'));
  expect(target).not.toContain('active-skills');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest __tests__/services/ProjectService.test.ts -t "directly to registry" -v`
Expected: FAIL（当前 sourceLink 指向 active-skills/<profile>/<skill>,且该目录不存在 → readlink 指向中转路径,断言不等）

- [ ] **Step 3: 改 activateProfile**（删去 `resolveActiveSkillsDir`/`profileActiveDir`,sourceLink 直指 registry)

替换 `src/services/ProjectService.ts` 第 52-72 行区域为:

```ts
    const skills: ProjectActivationResult['skills'] = [];

    for (const tool of ['.claude', '.codex']) {
      const toolSkillsDir = path.join(projectPath, tool, 'skills');

      for (const skillPath of profile.skills) {
        const skillName = path.basename(skillPath);
        const sourceLink = path.join(this.config.source, skillPath);
        const targetLink = path.join(toolSkillsDir, skillName);

        try {
          await fs.mkdir(toolSkillsDir, { recursive: true });
          try { await fs.unlink(targetLink); } catch {}
          await fs.symlink(sourceLink, targetLink);
          skills.push({ name: skillName, targetPath: path.join(tool, 'skills', skillName), status: 'linked' });
        } catch (error) {
          skills.push({
            name: skillName,
            targetPath: path.join(tool, 'skills', skillName),
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
```

并删除文件顶部 `import { Config, resolveActiveSkillsDir }` 中的 `resolveActiveSkillsDir`(改为 `import { Config }`)。`ensureWithin` 若不再被使用,一并删除。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx jest __tests__/services/ProjectService.test.ts -v`
Expected: PASS（全部 ProjectService 测试）

- [ ] **Step 5: Commit**

```bash
git add src/services/ProjectService.ts __tests__/services/ProjectService.test.ts
git commit -m "feat(project): link project skills directly to registry, drop active-skills hop"
```

### Task B2: use.ts 去掉 materialize 调用

**Files:**
- Modify: `src/commands/use.ts:7-25`
- Test: `__tests__/commands/use.test.ts`

- [ ] **Step 1: 改测试**（更新 use.test.ts: 去掉 config 中的 `activeDir`;把"default generated cache"用例改为断言直链 registry)

将 `beforeEach` 中 `config` 改为不含 `activeDir`:

```ts
    config = {
      source: testDir,
      tools: {},
      profilesDir: path.join(testDir, 'profiles'),
    };
```

将 `should use default generated cache when activeDir is not configured` 整个用例替换为:

```ts
  it('links project skills directly to registry (no active-skills)', async () => {
    const result = await runUse(config, projectDir, 'test');
    expect(result.profile).toBe('test');
    const target = await fs.readlink(path.join(projectDir, '.codex', 'skills', 'git-commit'));
    expect(target).toBe(path.join(testDir, 'global', 'git-commit'));
    expect(target).not.toContain('active-skills');
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest __tests__/commands/use.test.ts -v`
Expected: FAIL（runUse 仍调 materialize,且测试断言已改为直链）

- [ ] **Step 3: 改 runUse**

```ts
import { Command } from 'commander';
import { Config } from '../lib/config';
import { ProfileService } from '../services/ProfileService';
import { ProjectService } from '../services/ProjectService';

export const runUse = async (
  config: Config,
  projectPath: string,
  profileName?: string
) => {
  const profileSvc = new ProfileService(config);
  const projectSvc = new ProjectService(config, profileSvc);

  const finalProfile = profileName ||
    projectSvc.inferProfile(projectPath) ||
    'global-lite';

  return await projectSvc.activateProfile(projectPath, finalProfile);
};
```

（`registerUse` 部分不变。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npx jest __tests__/commands/use.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/use.ts __tests__/commands/use.test.ts
git commit -m "feat(use): activate without materialize, link straight to registry"
```

### Task B3: 删除 materialize 命令 + MaterializeService + 注册

**Files:**
- Delete: `src/commands/materialize.ts`, `src/services/MaterializeService.ts`
- Delete: `__tests__/commands/materialize.test.ts`, `__tests__/services/MaterializeService.test.ts`
- Modify: `src/index.ts:10,30`

- [ ] **Step 1: 删除文件**

```bash
git rm src/commands/materialize.ts src/services/MaterializeService.ts \
       __tests__/commands/materialize.test.ts __tests__/services/MaterializeService.test.ts
```

- [ ] **Step 2: 改 index.ts**（移除 import 与注册行）

删除第 10 行 `import { registerMaterialize } from './commands/materialize';`
删除第 30 行 `registerMaterialize(program, readConfig);`

- [ ] **Step 3: 跑构建确认无悬空引用**

Run: `npm run build`
Expected: PASS（无 TS 编译错误;若报 `MaterializeResult` 或 `resolveActiveSkillsDir` 未使用/缺失,进入 B4/B5 修正)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove materialize command and MaterializeService"
```

### Task B4: config 删除 resolveActiveSkillsDir / activeDir / cacheDir

**Files:**
- Modify: `src/lib/config.ts:16-23,101-111`
- Test: `__tests__/lib/config.test.ts`

- [ ] **Step 1: 改测试**（删除三个 `resolveActiveSkillsDir ...` 用例;把含 `activeDir` 的 config fixture 去掉该字段)

删除 `config.test.ts` 第 275-308 行的三个 `resolveActiveSkillsDir` 测试。
将 `readConfig reads config with profile fields from disk` 与 `writeConfig writes config with profile fields ...` 两个用例里的 `activeDir: '~/.sync-spells/active',` 行删除(保留 `defaultProfile`、`profilesDir`)。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest __tests__/lib/config.test.ts -v`
Expected: FAIL（`resolveActiveSkillsDir` 已被测试引用删除前仍导出 → 一旦 Step 3 删除导出,残留引用会编译错;此步先确认改后测试集形态)

- [ ] **Step 3: 改 config.ts**

删除 `Config` 接口中的 `activeDir?: string;` 与 `cacheDir?: string;`(第 21-22 行)。
删除整个 `resolveActiveSkillsDir` 函数(第 101-111 行)。

- [ ] **Step 4: 跑测试 + 构建确认通过**

Run: `npx jest __tests__/lib/config.test.ts -v && npm run build`
Expected: PASS（无残留 `resolveActiveSkillsDir` 引用——B1/B3 已清理其调用点)

- [ ] **Step 5: Commit**

```bash
git add src/lib/config.ts __tests__/lib/config.test.ts
git commit -m "refactor(config): drop resolveActiveSkillsDir/activeDir/cacheDir"
```

### Task B5: doctor 移除 active-skills check

**Files:**
- Modify: `src/commands/doctor.ts:5,54-57`
- Test: `__tests__/commands/doctor.test.ts`

- [ ] **Step 1: 改测试**（删除 doctor.test.ts 中断言 `active` check / `materialized profiles` 的用例)

打开 `__tests__/commands/doctor.test.ts`,删除任何断言 `check: 'active'` 或字符串 `materialized profiles` 的测试用例。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest __tests__/commands/doctor.test.ts -v`
Expected: FAIL（实现仍产出 active check,或测试已删但实现残留 import)

- [ ] **Step 3: 改 doctor.ts**

删除第 5 行 import 中的 `resolveActiveSkillsDir`(改为 `import { Config } from '../lib/config';`,若其它符号仍需要则保留它们)。
删除第 54-57 行 active-skills check 区块:

```ts
  const activeDir = resolveActiveSkillsDir(config);
  try {
    const materialized = await fs.readdir(activeDir);
    results.push({ check: 'active', status: 'ok', message: `${materialized.length} materialized profiles` });
  ...
```

整段(含其 catch)移除。

- [ ] **Step 4: 跑测试 + 构建确认通过**

Run: `npx jest __tests__/commands/doctor.test.ts -v && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/doctor.ts __tests__/commands/doctor.test.ts
git commit -m "refactor(doctor): remove active-skills check"
```

### Task B6: 删除 MaterializeResult 类型 + 全套绿灯

**Files:**
- Modify: `src/types/index.ts`
- Test: 全套

- [ ] **Step 1: 删除未使用类型**

在 `src/types/index.ts` 中删除 `MaterializeResult`(若 grep 确认无其它引用)。

Run 先确认: `grep -rn "MaterializeResult" src __tests__`
Expected: 无输出(B3 删除后应已无引用);若有残留先清理。

- [ ] **Step 2: 全套测试 + 构建**

Run: `npm run build && npm test`
Expected: PASS(全绿,无 TS 错误)

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "refactor(types): remove MaterializeResult"
```

---

## 运行时数据迁移（代码合并后执行,操作 iCloud sync-spells 仓库）

> ⚠️ 这些步骤改动当前正在加载 skill 的活链。务必按顺序,每步验证。`$SS` = `${SYNCSPELLS_PATH:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/sync-spells}`。

### Task M1: globalize task-run

- [ ] **Step 1: 快照当前四工具 skills 链(回滚依据)**

Run:
```bash
for t in .claude .agents .codex .cursor; do printf "%s -> " "$t"; readlink "$HOME/$t/skills" 2>/dev/null || echo "(none/real)"; done
```

- [ ] **Step 2: 物理移动 task-run 进 global/**

```bash
SS="${SYNCSPELLS_PATH:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/sync-spells}"
git -C "$SS" mv skills-registry/projects/lifeos/task-run skills-registry/global/task-run
```

- [ ] **Step 3: 更新所有 profile 引用**

将 `$SS/profiles/*.json` 中的 `projects/lifeos/task-run` 改为 `global/task-run`(逐文件 Edit;`jira-daily-worklog` 不动)。

- [ ] **Step 4: 验证引用一致**

Run: `grep -rn "projects/lifeos/task-run" "$SS/profiles" || echo "OK: no stale refs"`
Expected: `OK: no stale refs`

### Task M2: build + sync 重链 + 删 active-skills + setup.sh 退役

- [ ] **Step 1: 构建新 CLI**（`spells` 跑 dist,必须 build)

Run: `cd $HOME/codeLab/sync-spells && npm run build`
Expected: PASS

- [ ] **Step 2: 确认 ~/.sync-spells/config.json 为四工具 global→skills**

如非默认,运行 `spells setup`(选四工具)或手动写入与 `defaultConfig` 一致的内容,`source` 指向 `$SS/skills-registry`。

- [ ] **Step 3: 跑 sync 重链全局**

Run: `spells sync`
Expected: claude-code/agents 显示 `re-linked`,codex 显示 `backed-up`,cursor 显示 `linked`

- [ ] **Step 4: 验证四工具链 + codex 备份 + task-run**

Run:
```bash
SS="${SYNCSPELLS_PATH:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/sync-spells}"
for t in .claude .agents .codex .cursor; do printf "%s -> " "$t"; readlink "$HOME/$t/skills"; done
ls "$SS/skills-registry/global/task-run/SKILL.md"
ls -dt "$HOME/.sync-spells/backups/"*/ | head -1
```
Expected: 四个都指向 `.../skills-registry/global`;task-run SKILL.md 存在;最新 backup 目录存在(codex 旧内容)

- [ ] **Step 5: 新 session 验证全局 skill 加载(尤其 task-run)**

在一个新 Claude Code session 确认 `task-run` 等全局 skill 可用。确认无误后继续。

- [ ] **Step 6: 删除 active-skills 目录**

```bash
SS="${SYNCSPELLS_PATH:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/sync-spells}"
git -C "$SS" rm -r active-skills 2>/dev/null || rm -rf "$SS/active-skills"
rm -f "$SS/skills" 2>/dev/null   # 旧中转软链 skills -> active-skills/global-lite
```

- [ ] **Step 7: setup.sh 标注废弃**

在 `$SS/setup.sh` 顶部加注释:
```bash
# DEPRECATED: superseded by `spells sync` (SP-1). Kept until SP-3 removes legacy bash. Do not rely on this.
```

- [ ] **Step 8: 提交 iCloud 仓库迁移**

```bash
SS="${SYNCSPELLS_PATH:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/sync-spells}"
git -C "$SS" add -A
git -C "$SS" commit -m "chore(sp1): globalize task-run, drop active-skills, deprecate setup.sh"
```

---

## 验证（verification-before-completion）

- [ ] `cd $HOME/codeLab/sync-spells && npm run build && npm test` 全绿
- [ ] `spells sync` 四工具链全部指向 `skills-registry/global/`
- [ ] codex 原 `skills` 内容已备份到 `~/.sync-spells/backups/<ts>/`
- [ ] `spells use test`(临时项目)后 `.claude/skills/<skill>` 直链 registry,无 `active-skills` 段
- [ ] `grep -rn "active-skills\|resolveActiveSkillsDir\|MaterializeService\|registerMaterialize" src` 无输出
- [ ] 新 session 全局 skill(含 task-run)正常加载

---

## Self-Review

**Spec 覆盖核对:**
- 全局四工具接管 → A1/A2/A3 + M2 ✅
- config `global→skills` → A1/A2 ✅
- 项目级直链 registry → B1/B2 ✅
- 删 materialize/MaterializeService/active-skills/resolveActiveSkillsDir/activeDir/cacheDir → B3/B4/B6 ✅
- doctor 去 active check → B5 ✅
- task-run globalize / worklog 降级 → M1 ✅
- codex real-dir backup → 由现有 sync 状态机(A3 覆盖同类分支)+ M2 Step4 验证 ✅
- setup.sh 退役 → M2 Step7 ✅
- 迁移顺序(先 sync 再删 active-skills) → M2 Step3→Step6 ✅

**占位符扫描:** 无 TBD/TODO;每个代码步骤含完整代码或精确命令。

**类型/命名一致性:** `activateProfile`、`runUse`、`runSync`、`defaultConfig`、`TOOL_PRESETS`、`presetToToolConfig` 均与现有源码一致;新增 `agents` preset key 在 A2 定义、M2 使用,一致。
