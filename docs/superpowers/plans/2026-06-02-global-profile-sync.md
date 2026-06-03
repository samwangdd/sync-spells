# Global-Profile Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `spells sync` distribute global skills by resolving the `global` profile and merging its skills (own-only, per-skill symlinks) into each enabled tool's target dir, instead of symlinking a non-existent physical `global/` directory.

**Architecture:** A new focused module `src/commands/sync-global.ts` holds an ownership helper (`isOwnedLink`), a pure per-tool merge unit (`mergeGlobalSkills`), and an orchestrator (`runGlobalSync`) that resolves the `global` profile via `ResolveService` and merges into each tool whose mapping has `from === 'global'`. `runSync` is changed to skip `from === 'global'` mappings (now handled by the global pass), and the `sync` command action calls `runGlobalSync` as a third pass after skills and agents.

**Tech Stack:** TypeScript, Node `fs/promises`, Jest + ts-jest. Reuses `ResolveService`/`ProfileService`/`SkillService`, `lib/backup` (`backupPath`), `lib/config` (`expandHome`).

Spec: `docs/superpowers/specs/2026-06-02-global-profile-sync-design.md`

## File Structure
- **Create** `src/commands/sync-global.ts` — `GlobalSyncResult`, `isOwnedLink`, `mergeGlobalSkills`, `runGlobalSync`.
- **Create** `__tests__/commands/sync-global.test.ts` — unit tests for `isOwnedLink`, `mergeGlobalSkills`, `runGlobalSync`.
- **Modify** `src/commands/sync.ts` — skip `from === 'global'` in `runSync`; call `runGlobalSync` in the command action.
- **Modify** `__tests__/commands/sync.test.ts` — update the one test that asserted `from:'global'` dir→dir behavior.

---

## Task 1: Ownership helper + result type

**Files:**
- Create: `src/commands/sync-global.ts`
- Test: `__tests__/commands/sync-global.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/commands/sync-global.test.ts
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { mkdir, symlink, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { isOwnedLink } from '../../src/commands/sync-global';

describe('isOwnedLink', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-owned-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('true for a symlink resolving inside sourceRoot', async () => {
    const sourceRoot = path.join(root, 'skill-category');
    await mkdir(path.join(sourceRoot, 'foundation', 'picky'), { recursive: true });
    const link = path.join(root, 'picky');
    await symlink(path.join(sourceRoot, 'foundation', 'picky'), link);
    await expect(isOwnedLink(link, sourceRoot)).resolves.toBe(true);
  });

  test('false for a symlink pointing outside sourceRoot', async () => {
    const sourceRoot = path.join(root, 'skill-category');
    await mkdir(path.join(root, 'elsewhere'), { recursive: true });
    const link = path.join(root, 'x');
    await symlink(path.join(root, 'elsewhere'), link);
    await expect(isOwnedLink(link, sourceRoot)).resolves.toBe(false);
  });

  test('false for a real file', async () => {
    const sourceRoot = path.join(root, 'skill-category');
    const f = path.join(root, 'real.txt');
    await writeFile(f, 'x', 'utf8');
    await expect(isOwnedLink(f, sourceRoot)).resolves.toBe(false);
  });

  test('false for a missing path', async () => {
    await expect(isOwnedLink(path.join(root, 'nope'), path.join(root, 'skill-category'))).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/commands/sync-global.test.ts`
Expected: FAIL — `Cannot find module '../../src/commands/sync-global'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/commands/sync-global.ts
import * as fs from 'fs/promises';
import * as path from 'path';

export interface GlobalSyncResult {
  tool: string;
  skill: string;
  action: 'linked' | 'updated' | 'skipped' | 'pruned' | 'error';
  error?: string;
}

/** A target entry is sync-spells-owned iff it is a symlink resolving inside sourceRoot. */
export const isOwnedLink = async (linkPath: string, sourceRoot: string): Promise<boolean> => {
  try {
    const st = await fs.lstat(linkPath);
    if (!st.isSymbolicLink()) {
      return false;
    }
    const target = await fs.readlink(linkPath);
    const resolved = path.resolve(path.dirname(linkPath), target);
    return resolved === sourceRoot || resolved.startsWith(sourceRoot + path.sep);
  } catch {
    return false;
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/commands/sync-global.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/commands/sync-global.ts __tests__/commands/sync-global.test.ts
git commit -m "feat(sync): add isOwnedLink helper + GlobalSyncResult for global merge"
```

---

## Task 2: `mergeGlobalSkills` per-tool merge unit

**Files:**
- Modify: `src/commands/sync-global.ts` (add `mergeGlobalSkills`)
- Test: `__tests__/commands/sync-global.test.ts` (append)

`mergeGlobalSkills(config, toolKey, targetDir, desired)` takes the desired skills as `{ name, sourcePath }[]` (resolution is the orchestrator's job in Task 3), prepares the target dir, merges per-skill symlinks own-only, and prunes owned links no longer desired.

- [ ] **Step 1: Write the failing test (append)**

```typescript
// append to __tests__/commands/sync-global.test.ts
import { lstat, readlink, readFile, readdir } from 'fs/promises';
import { mergeGlobalSkills } from '../../src/commands/sync-global';

describe('mergeGlobalSkills', () => {
  let home: string;
  let sourceRoot: string;

  const desiredFor = (names: string[]) =>
    names.map((n) => ({ name: n, sourcePath: path.join(sourceRoot, 'foundation', n) }));

  beforeEach(async () => {
    home = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-merge-'));
    sourceRoot = path.join(home, 'skill-category');
    for (const n of ['picky', 'evolution', 'socratic']) {
      await mkdir(path.join(sourceRoot, 'foundation', n), { recursive: true });
    }
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  // config only needs `source` for mergeGlobalSkills (used to compute sourceRoot for ownership)
  const cfg = () => ({ source: sourceRoot, tools: {} });

  test('links desired skills into a fresh (missing) target dir', async () => {
    const targetDir = path.join(home, 'claude', 'skills');
    const results = await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky', 'evolution']));
    expect((await lstat(path.join(targetDir, 'picky'))).isSymbolicLink()).toBe(true);
    expect(await readlink(path.join(targetDir, 'picky'))).toBe(path.join(sourceRoot, 'foundation', 'picky'));
    expect(results.filter((r) => r.action === 'linked').map((r) => r.skill).sort()).toEqual(['evolution', 'picky']);
  });

  test('is idempotent — second run reports skipped, no changes', async () => {
    const targetDir = path.join(home, 'claude', 'skills');
    await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky']));
    const results = await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky']));
    expect(results).toEqual([{ tool: 'claude-code', skill: 'picky', action: 'skipped' }]);
  });

  test('preserves foreign files and foreign symlinks (own-only)', async () => {
    const targetDir = path.join(home, 'claude', 'skills');
    await mkdir(targetDir, { recursive: true });
    await writeFile(path.join(targetDir, 'user-note.md'), 'mine', 'utf8');
    await mkdir(path.join(home, 'outside'), { recursive: true });
    await symlink(path.join(home, 'outside'), path.join(targetDir, 'foreign-link'));
    await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky']));
    expect(await readFile(path.join(targetDir, 'user-note.md'), 'utf8')).toBe('mine');
    expect((await lstat(path.join(targetDir, 'foreign-link'))).isSymbolicLink()).toBe(true);
    expect((await lstat(path.join(targetDir, 'picky'))).isSymbolicLink()).toBe(true);
  });

  test('prunes owned links no longer in the desired set', async () => {
    const targetDir = path.join(home, 'claude', 'skills');
    await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky', 'evolution']));
    const results = await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky']));
    expect(results).toContainEqual({ tool: 'claude-code', skill: 'evolution', action: 'pruned' });
    await expect(lstat(path.join(targetDir, 'evolution'))).rejects.toThrow();
  });

  test('converts a chain symlink target dir into a real dir (backs up first)', async () => {
    const realClaude = path.join(home, 'claude', 'skills');
    await mkdir(realClaude, { recursive: true });
    const targetDir = path.join(home, 'agents', 'skills');
    await mkdir(path.dirname(targetDir), { recursive: true });
    await symlink(realClaude, targetDir); // chain: agents/skills -> claude/skills
    await mergeGlobalSkills(cfg(), 'agents', targetDir, desiredFor(['picky']));
    expect((await lstat(targetDir)).isSymbolicLink()).toBe(false); // now a real dir
    expect((await lstat(path.join(targetDir, 'picky'))).isSymbolicLink()).toBe(true);
  });

  test('reports error (does not overwrite) when a foreign real file occupies a desired name', async () => {
    const targetDir = path.join(home, 'claude', 'skills');
    await mkdir(targetDir, { recursive: true });
    await writeFile(path.join(targetDir, 'picky'), 'foreign', 'utf8');
    const results = await mergeGlobalSkills(cfg(), 'claude-code', targetDir, desiredFor(['picky']));
    expect(results).toContainEqual(
      expect.objectContaining({ tool: 'claude-code', skill: 'picky', action: 'error' }),
    );
    expect(await readFile(path.join(targetDir, 'picky'), 'utf8')).toBe('foreign');
  });

  test('reports error when a desired skill source path is missing', async () => {
    const targetDir = path.join(home, 'claude', 'skills');
    const results = await mergeGlobalSkills(cfg(), 'claude-code', targetDir, [
      { name: 'ghost', sourcePath: path.join(sourceRoot, 'foundation', 'ghost') },
    ]);
    expect(results).toContainEqual(
      expect.objectContaining({ skill: 'ghost', action: 'error' }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/commands/sync-global.test.ts`
Expected: FAIL — `mergeGlobalSkills` is not exported.

- [ ] **Step 3: Write minimal implementation (append to `src/commands/sync-global.ts`)**

Add the import for `backupPath` and `expandHome` at the top of the file (merge with existing imports):

```typescript
import { backupPath } from '../lib/backup';
import { Config, expandHome } from '../lib/config';
```

Append the function:

```typescript
export const mergeGlobalSkills = async (
  config: Config,
  toolKey: string,
  targetDir: string,
  desired: { name: string; sourcePath: string }[],
): Promise<GlobalSyncResult[]> => {
  const sourceRoot = expandHome(config.source);
  const results: GlobalSyncResult[] = [];

  // Prepare the target dir: convert a symlink (e.g. a chain) into a real dir; create if missing.
  try {
    const st = await fs.lstat(targetDir);
    if (st.isSymbolicLink()) {
      await backupPath(targetDir);
      await fs.unlink(targetDir);
      await fs.mkdir(targetDir, { recursive: true });
    }
    // a real directory is used as-is
  } catch {
    await fs.mkdir(targetDir, { recursive: true });
  }

  const desiredNames = new Set(desired.map((d) => d.name));

  for (const { name, sourcePath } of desired) {
    const link = path.join(targetDir, name);

    try {
      await fs.access(sourcePath);
    } catch {
      results.push({ tool: toolKey, skill: name, action: 'error', error: `source missing: ${sourcePath}` });
      continue;
    }

    let st: import('fs').Stats | null = null;
    try {
      st = await fs.lstat(link);
    } catch {
      st = null;
    }

    if (!st) {
      await fs.symlink(sourcePath, link);
      results.push({ tool: toolKey, skill: name, action: 'linked' });
    } else if (st.isSymbolicLink()) {
      const current = await fs.readlink(link);
      if (current === sourcePath) {
        results.push({ tool: toolKey, skill: name, action: 'skipped' });
      } else if (await isOwnedLink(link, sourceRoot)) {
        await fs.unlink(link);
        await fs.symlink(sourcePath, link);
        results.push({ tool: toolKey, skill: name, action: 'updated' });
      } else {
        results.push({ tool: toolKey, skill: name, action: 'error', error: 'foreign symlink at target name' });
      }
    } else {
      results.push({ tool: toolKey, skill: name, action: 'error', error: 'foreign entry at target name' });
    }
  }

  // Prune owned links no longer desired.
  let entries: string[] = [];
  try {
    entries = await fs.readdir(targetDir);
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (desiredNames.has(entry)) {
      continue;
    }
    const link = path.join(targetDir, entry);
    if (await isOwnedLink(link, sourceRoot)) {
      await fs.unlink(link);
      results.push({ tool: toolKey, skill: entry, action: 'pruned' });
    }
  }

  return results;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/commands/sync-global.test.ts`
Expected: PASS (4 `isOwnedLink` + 7 `mergeGlobalSkills` = 11).

- [ ] **Step 5: Commit**

```bash
git add src/commands/sync-global.ts __tests__/commands/sync-global.test.ts
git commit -m "feat(sync): add mergeGlobalSkills own-only per-tool merge"
```

---

## Task 3: `runGlobalSync` orchestrator (resolves the global profile)

**Files:**
- Modify: `src/commands/sync-global.ts` (add `runGlobalSync`)
- Test: `__tests__/commands/sync-global.test.ts` (append)

- [ ] **Step 1: Write the failing test (append)**

```typescript
// append to __tests__/commands/sync-global.test.ts
import { jest } from '@jest/globals';

const loadGlobalModule = (homeDir: string) => {
  jest.resetModules();
  const actualOs = jest.requireActual<typeof import('os')>('os');
  jest.doMock('os', () => ({ ...actualOs, homedir: () => homeDir }));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/commands/sync-global') as typeof import('../../src/commands/sync-global');
};

describe('runGlobalSync', () => {
  let home: string;
  let workspace: string;
  let sourceRoot: string;

  beforeEach(async () => {
    home = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-gsync-home-'));
    workspace = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-gsync-ws-'));
    sourceRoot = path.join(workspace, 'skill-category');
    for (const n of ['picky', 'evolution']) {
      await mkdir(path.join(sourceRoot, 'foundation', n), { recursive: true });
    }
    await mkdir(path.join(workspace, 'profiles'), { recursive: true });
    await writeFile(
      path.join(workspace, 'profiles', 'global.json'),
      JSON.stringify({ name: 'global', extras: ['foundation/picky', 'foundation/evolution'] }),
      'utf8',
    );
  });

  afterEach(() => {
    jest.dontMock('os');
    rmSync(home, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  });

  const writeCfg = (tools: Record<string, unknown>) => {
    const dir = path.join(home, '.sync-spells');
    require('fs').mkdirSync(dir, { recursive: true });
    require('fs').writeFileSync(
      path.join(dir, 'config.json'),
      JSON.stringify({ source: sourceRoot, profilesDir: path.join(workspace, 'profiles'), tools }),
      'utf8',
    );
  };

  test('resolves the global profile and merges its skills into from:global tools', async () => {
    const claudeSkills = path.join(home, '.claude', 'skills');
    writeCfg({
      'claude-code': { enabled: true, configPath: path.join(home, '.claude'), mappings: [{ from: 'global', to: 'skills' }] },
    });
    const { runGlobalSync } = loadGlobalModule(home);
    const results = await runGlobalSync();
    expect((await lstat(path.join(claudeSkills, 'picky'))).isSymbolicLink()).toBe(true);
    expect((await lstat(path.join(claudeSkills, 'evolution'))).isSymbolicLink()).toBe(true);
    expect(results.filter((r) => r.action === 'linked').length).toBe(2);
  });

  test('ignores tools without a from:global mapping', async () => {
    writeCfg({
      'claude-code': { enabled: true, configPath: path.join(home, '.claude'), mappings: [{ from: 'commands', to: 'commands' }] },
    });
    const { runGlobalSync } = loadGlobalModule(home);
    expect(await runGlobalSync()).toEqual([]);
  });

  test('throws a clear error when the global profile is missing', async () => {
    rmSync(path.join(workspace, 'profiles', 'global.json'));
    writeCfg({
      'claude-code': { enabled: true, configPath: path.join(home, '.claude'), mappings: [{ from: 'global', to: 'skills' }] },
    });
    const { runGlobalSync } = loadGlobalModule(home);
    await expect(runGlobalSync()).rejects.toThrow(/global/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/commands/sync-global.test.ts`
Expected: FAIL — `runGlobalSync` is not exported.

- [ ] **Step 3: Write minimal implementation (append to `src/commands/sync-global.ts`)**

Add imports at the top (merge with existing):

```typescript
import { readConfig } from '../lib/config';
import { ProfileService } from '../services/ProfileService';
import { SkillService } from '../services/SkillService';
import { ResolveService } from '../services/ResolveService';
```

(Note: `Config` and `expandHome` are already imported from `../lib/config` in Task 2 — add `readConfig` to that same import line rather than duplicating.)

Append the function:

```typescript
export const runGlobalSync = async (): Promise<GlobalSyncResult[]> => {
  const config = await readConfig();
  if (!config.source) {
    throw new Error('No source configured. Run `spells setup` first.');
  }

  const resolved = await new ResolveService(
    config,
    new ProfileService(config),
    new SkillService(config),
  ).resolve('global');

  const sourceRoot = expandHome(config.source);
  const desired = resolved.skills.map((skillPath) => ({
    name: path.basename(skillPath),
    sourcePath: path.join(sourceRoot, skillPath),
  }));

  const results: GlobalSyncResult[] = [];
  for (const [toolKey, toolConfig] of Object.entries(config.tools)) {
    if (!toolConfig.enabled) {
      continue;
    }
    for (const mapping of toolConfig.mappings) {
      if (mapping.from !== 'global') {
        continue;
      }
      const targetDir = path.join(expandHome(toolConfig.configPath), mapping.to);
      results.push(...(await mergeGlobalSkills(config, toolKey, targetDir, desired)));
    }
  }
  return results;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/commands/sync-global.test.ts`
Expected: PASS (11 + 3 = 14). Also run `npm run build` — tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/commands/sync-global.ts __tests__/commands/sync-global.test.ts
git commit -m "feat(sync): add runGlobalSync orchestrator resolving the global profile"
```

---

## Task 4: Wire into `spells sync` (skip from:global in runSync; add global pass)

**Files:**
- Modify: `src/commands/sync.ts`
- Modify: `__tests__/commands/sync.test.ts` (update the one `from:'global'` dir→dir test)

- [ ] **Step 1: Update the existing test to the new behavior**

In `__tests__/commands/sync.test.ts`, replace the test named `runSync re-links global to skills when target points at old generated cache` (it asserted the old physical-dir behavior) with this test asserting `runSync` now ignores `from:'global'`:

```typescript
  test("runSync ignores from:'global' mappings (handled by the global pass)", async () => {
    const { runSync } = loadSyncModule(tempHome);
    const sourceDir = path.join(tempHome, 'source');
    const toolDir = path.join(tempHome, 'claude');
    mkdirSync(path.join(sourceDir, 'global'), { recursive: true });
    mkdirSync(toolDir, { recursive: true });

    writeTestConfig(tempHome, sourceDir, {
      'claude-code': { enabled: true, configPath: toolDir, mappings: [{ from: 'global', to: 'skills' }] },
    });

    const results = await runSync();
    expect(results).toEqual([]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/commands/sync.test.ts`
Expected: FAIL — current `runSync` still produces a result for `from:'global'` (it symlinks the physical `source/global`), so `results` is not `[]`.

- [ ] **Step 3: Modify `runSync` to skip `from === 'global'`**

In `src/commands/sync.ts`, inside the `for (const mapping of toolConfig.mappings)` loop, add this as the FIRST statement of the loop body (before `const sourcePath = ...`):

```typescript
      // `global` is a reserved mapping handled by the global-profile pass (runGlobalSync).
      if (mapping.from === 'global') {
        continue;
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/commands/sync.test.ts`
Expected: PASS (the new test + all other sync tests; the other tests use `from:'commands'` so they are unaffected).

- [ ] **Step 5: Wire `runGlobalSync` into the sync command action**

In `src/commands/sync.ts`, add to the imports at the top:

```typescript
import { runGlobalSync } from './sync-global';
```

In `registerSync`, in the `.action(async () => { ... })`, insert the global pass AFTER the skills summary line (`console.log(\`\nSkills: ...\`)`) and BEFORE the agents pass (`const agentResults = await runAgentSync();`):

```typescript
      const globalResults = await runGlobalSync();
      for (const r of globalResults) {
        const icon = r.action === 'error' ? '✗' : r.action === 'skipped' ? '=' : '+';
        const suffix = r.error ? ` (${r.error})` : '';
        console.log(`  ${icon} [${r.tool}] global ${r.skill}: ${r.action}${suffix}`);
      }
      const globalChanged = globalResults.filter((r) => r.action !== 'skipped').length;
      console.log(`Global skills: ${globalChanged} updated, ${globalResults.length - globalChanged} unchanged.`);
```

- [ ] **Step 6: Run the full suite + build**

Run: `npm test && npm run build`
Expected: all tests PASS; `tsc` clean.

- [ ] **Step 7: Commit**

```bash
git add src/commands/sync.ts __tests__/commands/sync.test.ts
git commit -m "feat(sync): skip from:'global' in runSync and add global-profile pass to sync action"
```

---

## Self-Review

**Spec coverage:**
- §Behavior (from:'global' → profile merge; others unchanged) → Task 4 (skip in runSync) + Task 3 (orchestrator only acts on from:'global').
- §Resolving the global skill set (ResolveService.resolve('global'), missing → error) → Task 3 (+ missing-profile test).
- §Per-tool merge own-only (prepare dir, ownership rule, link/update/skip/error/prune, foreign untouched) → Task 2 (all branches + tests).
- §Chain conversion (symlink dir → backup + real dir) → Task 2 (chain test).
- §Result reporting (`Global skills:` section) → Task 4 (action printout).
- §Structure (sync-global.ts unit, isOwnedLink, reuse ResolveService/backup) → Tasks 1–3.
- §Error handling (missing profile, missing source, foreign collision, idempotency) → Tasks 2 & 3.
- §Testing (7 scenarios) → Task 2 (7 mergeGlobalSkills tests) + Task 3.

**Placeholder scan:** none — every step has full code and exact commands.

**Type consistency:** `GlobalSyncResult` (Task 1) is returned by `mergeGlobalSkills` (Task 2) and `runGlobalSync` (Task 3) and consumed by the action printout (Task 4). `isOwnedLink(linkPath, sourceRoot)` (Task 1) is used in Task 2. `mergeGlobalSkills(config, toolKey, targetDir, desired)` signature in Task 2 matches the call in Task 3. `runGlobalSync()` (Task 3) matches the import/call in Task 4. The reserved value `'global'` is used identically in Task 3 (`mapping.from !== 'global'`) and Task 4 (`mapping.from === 'global'`).

**Note on simplification vs spec:** the spec mentioned an optional per-tool "backed-up" note when a chain symlink is converted. This plan backs up the symlink (verified by the chain-conversion test) but does not emit a separate report line for it — the per-skill results plus the on-disk backup are sufficient. No behavior is lost.
