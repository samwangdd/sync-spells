# SP-2 目录分类 4+2 + migrate + resolve 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** registry 迁到 4+2(coding/collaboration/workflow + global/external/inbox),profile 改 category 格式,新增 `ResolveService`/`resolve`/`migrate`,`use` 经 resolve 直链 registry(排除 global)。

**Architecture:** 复用 SP-1 直链模型(无 active-skills)。ResolveService 把 profile 的 categories/extras/extends 展开成 skill 列表(**不含 global**),交给 ProjectService 直链。migrate 做一次性目录重构 + profile 扁平→category 转换(带备份 + dry-run)。

**Tech Stack:** TS strict, Jest, Commander, fs/promises。已存在:`globalizeSkill`(SkillService)、`preset` 命令、listCategories(含 coding)。

**前置:** 分支 `feat/sp2-category-restructure`(已建)。Spec: `docs/superpowers/specs/2026-05-31-sp2-category-restructure-design.md`。

---

## 文件结构

| 文件 | 动作 |
|---|---|
| `src/types/index.ts` | Profile 加 `categories?`/`extras?`/`extends?`(保留 `skills?` legacy);确认 SkillCategory 含新类别 |
| `src/services/ResolveService.ts` | **新建** resolve 逻辑 |
| `src/commands/resolve.ts` | **新建** `spells resolve <profile>` |
| `src/services/MigrateService.ts` | **新建** 目录重构 + profile 转换 |
| `src/commands/migrate.ts` | **新建** `spells migrate [--dry-run]` |
| `src/commands/use.ts` | 改 runUse:resolve → activateProfile(skill 列表) |
| `src/services/ProjectService.ts` | activateProfile 增接收 skill 列表的路径 |
| `src/services/SkillService.ts` | 删 `:61` 的 `!== 'active-skills'` 死 filter |
| `src/index.ts` | 注册 resolve、migrate |

执行顺序:T1 类型 → T2 ResolveService → T3 resolve 命令 → T4 use 集成 → T5 SkillService 清理 → T6 MigrateService → T7 migrate 命令 → 运行时 migrate(确认点)。

---

### Task 1: Profile 类型加 category 字段

**Files:** Modify `src/types/index.ts`; Test `__tests__/types/index.test.ts`

- [ ] **Step 1: 写失败测试**
```ts
import { describe, expect, test } from '@jest/globals';
import type { Profile } from '../../src/types';
test('Profile supports categories/extras/extends and legacy skills', () => {
  const p: Profile = { name: 'x', categories: ['coding'], extras: ['collaboration/lark-doc'], extends: null };
  const legacy: Profile = { name: 'y', skills: ['global/git-commit'] };
  expect(p.categories).toEqual(['coding']);
  expect(legacy.skills).toEqual(['global/git-commit']);
});
```
- [ ] **Step 2: 跑** `npx jest __tests__/types/index.test.ts -t "categories/extras" -v` → FAIL(类型无这些字段)
- [ ] **Step 3: 改 `src/types/index.ts`** 的 `Profile`:
```ts
export interface Profile {
  name: string;
  categories?: string[];
  extras?: string[];
  extends?: string | null;
  skills?: string[];
}
```
确认 `SkillCategory` 含 `'global' | 'coding' | 'collaboration' | 'workflow' | 'external' | 'inbox'`(如缺则补齐;保留现有以防兼容)。
- [ ] **Step 4: 跑** 同上 → PASS;`npm run build` 通过
- [ ] **Step 5: Commit** `git add src/types/index.ts __tests__/types/index.test.ts && git commit -m "feat(types): category-based Profile fields"`

> 注意:`ProfileService.isProfile` 当前要求 `skills` 是数组。改为:`name` 是 string 且(`skills` 是数组 **或** `categories` 是数组 **或** 二者皆无但有 `extras`)。具体:`typeof name==='string' && (Array.isArray(skills) || Array.isArray(categories) || Array.isArray(extras) || skills===undefined)`。在 T2 一并处理(ResolveService 依赖 getProfile 能读 category profile)。

### Task 2: ResolveService

**Files:** Create `src/services/ResolveService.ts`; Modify `src/services/ProfileService.ts`(放宽 isProfile);Test `__tests__/services/ResolveService.test.ts`

- [ ] **Step 1: 写失败测试**(临时 registry + profiles)
```ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../../src/lib/config';
import { ProfileService } from '../../src/services/ProfileService';
import { SkillService } from '../../src/services/SkillService';
import { ResolveService } from '../../src/services/ResolveService';

describe('ResolveService', () => {
  let dir: string; let cfg: Config;
  beforeEach(async () => {
    dir = `/tmp/resolve-${Date.now()}`;
    for (const s of ['global/git-commit','coding/web-perf','coding/scss','collaboration/lark-doc','workflow/task-run'])
      await fs.mkdir(path.join(dir, s), { recursive: true });
    await fs.mkdir(path.join(dir, 'profiles'), { recursive: true });
    await fs.writeFile(path.join(dir,'profiles','mexc.json'),
      JSON.stringify({ name:'mexc', categories:['coding'], extras:['collaboration/lark-doc'] }));
    await fs.writeFile(path.join(dir,'profiles','base.json'),
      JSON.stringify({ name:'base', categories:['workflow'] }));
    await fs.writeFile(path.join(dir,'profiles','child.json'),
      JSON.stringify({ name:'child', extends:'base', categories:['coding'] }));
    await fs.writeFile(path.join(dir,'profiles','legacy.json'),
      JSON.stringify({ name:'legacy', skills:['global/git-commit','coding/scss'] }));
    cfg = { source: dir, tools: {}, profilesDir: path.join(dir,'profiles') };
  });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  const mk = () => new ResolveService(cfg, new ProfileService(cfg), new SkillService(cfg));

  it('expands categories and extras, excludes global', async () => {
    const r = await mk().resolve('mexc');
    expect(r.skills.sort()).toEqual(['coding/scss','coding/web-perf','collaboration/lark-doc'].sort());
    expect(r.skills.some(s => s.startsWith('global/'))).toBe(false);
  });
  it('resolves extends recursively', async () => {
    const r = await mk().resolve('child');
    expect(r.skills.sort()).toEqual(['coding/scss','coding/web-perf','workflow/task-run'].sort());
  });
  it('legacy skills filter out global', async () => {
    const r = await mk().resolve('legacy');
    expect(r.skills).toEqual(['coding/scss']);
  });
});
```
- [ ] **Step 2: 跑** `npx jest __tests__/services/ResolveService.test.ts -v` → FAIL(无 ResolveService)
- [ ] **Step 3: 创建 `src/services/ResolveService.ts`**
```ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../lib/config';
import { ProfileService } from './ProfileService';
import { SkillService } from './SkillService';

export interface ResolvedProfile {
  name: string;
  skills: string[];
  sources: { extends: string[]; categories: string[]; extras: string[]; legacy: string[] };
}

export class ResolveService {
  constructor(private config: Config, private profileSvc: ProfileService, private skillSvc: SkillService) {}

  async resolve(name: string, seen: string[] = []): Promise<ResolvedProfile> {
    if (seen.includes(name)) throw new Error(`Circular profile extends: ${[...seen, name].join(' -> ')}`);
    if (seen.length >= 5) throw new Error(`extends chain too deep (>5): ${[...seen, name].join(' -> ')}`);
    const profile = await this.profileSvc.getProfile(name);
    if (!profile) throw new Error(`Profile not found: ${name}`);

    const sources = { extends: [] as string[], categories: [] as string[], extras: [] as string[], legacy: [] as string[] };

    if (profile.extends) {
      const parent = await this.resolve(profile.extends, [...seen, name]);
      sources.extends = parent.skills;
    }
    for (const cat of profile.categories || []) {
      const catDir = path.join(this.config.source, cat);
      try { await fs.access(catDir); } catch { continue; }
      const entries = await fs.readdir(catDir, { withFileTypes: true });
      for (const e of entries) if (e.isDirectory()) sources.categories.push(`${cat}/${e.name}`);
    }
    sources.extras = (profile.extras || []).slice();
    sources.legacy = (profile.skills || []).filter(s => !s.startsWith('global/'));

    // dedup by basename, later wins; global excluded throughout
    const ordered = [...sources.extends, ...sources.categories, ...sources.extras, ...sources.legacy]
      .filter(s => !s.startsWith('global/'));
    const byName = new Map<string, string>();
    for (const s of ordered) byName.set(path.basename(s), s);
    return { name, skills: [...byName.values()], sources };
  }
}
```
- [ ] **Step 4:** 放宽 `ProfileService.isProfile`:`return typeof obj.name === 'string' && (Array.isArray(obj.skills) || Array.isArray((obj as any).categories) || Array.isArray((obj as any).extras) || obj.skills === undefined);`
- [ ] **Step 5: 跑** `npx jest __tests__/services/ResolveService.test.ts -v` → PASS;`npm run build`
- [ ] **Step 6: Commit** `git add src/services/ResolveService.ts src/services/ProfileService.ts __tests__/services/ResolveService.test.ts && git commit -m "feat(resolve): ResolveService expands categories/extras/extends, excludes global"`

### Task 3: resolve 命令

**Files:** Create `src/commands/resolve.ts`; Modify `src/index.ts`; Test `__tests__/commands/resolve.test.ts`

- [ ] **Step 1: 写测试**(runResolve 返回 skill 列表)
```ts
// build temp registry+profile like ResolveService test, then:
import { runResolve } from '../../src/commands/resolve';
it('runResolve returns resolved skills', async () => {
  const r = await runResolve(cfg, 'mexc');
  expect(r.skills).toContain('collaboration/lark-doc');
});
```
- [ ] **Step 2: 跑** → FAIL
- [ ] **Step 3: 创建 `src/commands/resolve.ts`**
```ts
import { Command } from 'commander';
import { Config } from '../lib/config';
import { ProfileService } from '../services/ProfileService';
import { SkillService } from '../services/SkillService';
import { ResolveService } from '../services/ResolveService';

export const runResolve = async (config: Config, name: string) =>
  new ResolveService(config, new ProfileService(config), new SkillService(config)).resolve(name);

export const registerResolve = (program: Command, getConfig: () => Promise<Config>): void => {
  program.command('resolve <profile>').description('Print the resolved skill list for a profile')
    .action(async (name: string) => {
      const config = await getConfig();
      try {
        const r = await runResolve(config, name);
        console.log(`\nResolved ${r.name} (${r.skills.length} skills, global excluded):`);
        r.skills.forEach(s => console.log(`  - ${s}`));
        console.log('');
      } catch (e) { console.error(`\nError: ${e}\n`); process.exit(1); }
    });
};
```
- [ ] **Step 4:** `src/index.ts` 加 `import { registerResolve } from './commands/resolve';` + `registerResolve(program, readConfig);`
- [ ] **Step 5: 跑** test + `npm run build` → PASS
- [ ] **Step 6: Commit** `git add src/commands/resolve.ts src/index.ts __tests__/commands/resolve.test.ts && git commit -m "feat(resolve): add spells resolve command"`

### Task 4: use 经 resolve 直链

**Files:** Modify `src/commands/use.ts`, `src/services/ProjectService.ts`; Test `__tests__/commands/use.test.ts`

- [ ] **Step 1: 写/改测试**:profile 为 category 格式时,`use` 把 categories 展开的 skill 直链到项目,且**不含 global**。
```ts
it('use resolves category profile and links to project (no global)', async () => {
  // registry: global/git-commit, coding/web-perf ; profile mexc {categories:['coding']}
  await fs.mkdir(path.join(testDir,'coding','web-perf'),{recursive:true});
  await fs.writeFile(path.join(testDir,'profiles','mexc.json'), JSON.stringify({name:'mexc',categories:['coding']}));
  const result = await runUse(config, projectDir, 'mexc');
  const target = await fs.readlink(path.join(projectDir,'.claude','skills','web-perf'));
  expect(target).toBe(path.join(testDir,'coding','web-perf'));
  await expect(fs.access(path.join(projectDir,'.claude','skills','git-commit'))).rejects.toBeTruthy();
});
```
- [ ] **Step 2: 跑** → FAIL
- [ ] **Step 3:** 给 `ProjectService` 加 `activateSkills(projectPath: string, profileName: string, skills: string[])`(直链给定列表,复用现有 per-skill 循环;sourceLink=`config.source/<skillPath>`,写 `.sync-spells.json` state)。在 `runUse` 中:
```ts
import { ResolveService } from '../services/ResolveService';
import { SkillService } from '../services/SkillService';
export const runUse = async (config, projectPath, profileName?) => {
  const profileSvc = new ProfileService(config);
  const projectSvc = new ProjectService(config, profileSvc);
  const finalProfile = profileName || projectSvc.inferProfile(projectPath) || 'global-lite';
  const resolved = await new ResolveService(config, profileSvc, new SkillService(config)).resolve(finalProfile);
  return await projectSvc.activateSkills(projectPath, finalProfile, resolved.skills);
};
```
保留 `activateProfile`(legacy 测试用)或让 `activateSkills` 复用其循环抽出的私有方法。
- [ ] **Step 4: 跑** `npx jest __tests__/commands/use.test.ts __tests__/services/ProjectService.test.ts -v` → PASS(更新受影响断言)
- [ ] **Step 5: Commit** `git add -A 的具体路径; commit -m "feat(use): activate via resolve (category profiles, global excluded)"`

### Task 5: 清理 SkillService :61 死 filter

**Files:** Modify `src/services/SkillService.ts`

- [ ] **Step 1:** 删 `listCategories` 中 `&& name !== 'active-skills'`(active-skills 已不存在)。`preferred` 列表更新为 `['global','coding','collaboration','workflow','external','inbox']`。
- [ ] **Step 2: 跑** `npm run build && npx jest __tests__/services/SkillService.test.ts -v` → PASS
- [ ] **Step 3: Commit** `git add src/services/SkillService.ts && git commit -m "refactor(skill): drop dead active-skills filter, update category order"`

### Task 6: MigrateService

**Files:** Create `src/services/MigrateService.ts`; Test `__tests__/services/MigrateService.test.ts`

- [ ] **Step 1: 写失败测试**(临时旧结构 → migrate → 断言新结构 + 备份 + profile 转换)
```ts
it('migrate restructures dirs, converts profiles, creates backup', async () => {
  // build old: domains/frontend/web-perf, domains/lark/lark-doc, projects/mexc/kickoff, workflows/marathon, global/git-commit
  // profile flat: {name:'mexc', skills:['global/git-commit','domains/frontend/web-perf','domains/lark/lark-doc','projects/mexc/kickoff']}
  const svc = new MigrateService(cfg);
  const report = await svc.migrate({ dryRun: false });
  await expect(fs.access(path.join(dir,'coding','web-perf'))).resolves.toBeUndefined();
  await expect(fs.access(path.join(dir,'collaboration','lark-doc'))).resolves.toBeUndefined();
  await expect(fs.access(path.join(dir,'workflow','marathon'))).resolves.toBeUndefined();
  const prof = JSON.parse(await fs.readFile(path.join(dir,'profiles','mexc.json'),'utf8'));
  expect(prof.categories).toContain('coding');
  expect(report.backupDir).toContain('skills-registry-backup');
});
it('dry-run does not move anything', async () => {
  const svc = new MigrateService(cfg);
  await svc.migrate({ dryRun: true });
  await expect(fs.access(path.join(dir,'domains','frontend','web-perf'))).resolves.toBeUndefined();
});
```
- [ ] **Step 2: 跑** → FAIL
- [ ] **Step 3: 创建 `MigrateService`** 实现映射(spec 映射表)、备份(复制 registry → `<source>/../skills-registry-backup-<stamp>`,stamp 由调用方传入避免 Date.now)、目录移动(fs.rename)、profile 扁平→category 转换(扫每个非 global skill 的新 category,聚合为 categories;`global/*` 移除;无法整类的进 extras)、删空壳、返回 report。**注意:脚本环境禁用 Date.now,stamp 作为参数传入。**
- [ ] **Step 4: 跑** test → PASS;`npm run build`
- [ ] **Step 5: Commit**

### Task 7: migrate 命令

**Files:** Create `src/commands/migrate.ts`; Modify `src/index.ts`; Test `__tests__/commands/migrate.test.ts`

- [ ] **Step 1: 写测试**(runMigrate dry-run 返回计划)
- [ ] **Step 2: 跑** → FAIL
- [ ] **Step 3: 创建 `migrate.ts`**:`--dry-run` 选项,调用 MigrateService(stamp 用 `new Date().toISOString()` 在命令层生成并传入 service),打印报告。注册到 index。
- [ ] **Step 4: 跑** test + `npm run build`;**全套 `npm test`**
- [ ] **Step 5: Commit**

---

## 运行时迁移(确认点,操作 iCloud registry)

> ⚠️ 重构用户 iCloud skill 仓库(移动数十个 skill 目录)。先 `--dry-run`,带备份,确认后执行。
- [ ] build:`cd ~/codeLab/sync-spells && npm run build`
- [ ] `spells migrate --dry-run` → 审阅计划
- [ ] (确认)`spells migrate` → registry 变 4+2 + 备份 + profiles 转 category
- [ ] `spells resolve mexc-code` → 输出含 coding/* 不含 global
- [ ] `spells use mexc-code`(临时项目)→ 直链验证
- [ ] iCloud 仓库 git 记账留给用户(同 SP-1,drift 多)

## 验证
- [ ] `npm run build && npm test` 全绿
- [ ] resolve 排除 global、extends 递归、去重正确
- [ ] migrate --dry-run 不动文件;真实 migrate 带备份
- [ ] use 经 resolve 直链 registry

## Self-Review
- Spec 覆盖:类型 T1 / ResolveService T2 / resolve 命令 T3 / use 集成 T4 / :61 清理 T5 / migrate T6+T7 / globalize(已存在,仅 spec 记录)✓
- 占位符:migrate profile 转换启发式在 T6 Step3 描述较概括 —— 实现时按 spec 映射表;若实现者判断不足,标 DONE_WITH_CONCERNS。
- Date.now 禁用:migrate 的 stamp 在命令层生成传入 service(测试传固定值)。
