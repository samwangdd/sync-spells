# CLI Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement four CLI commands (setup, push, sync, status) for sync-spells, enabling users to manage AI agent spells across Claude Code, Cursor, Codex, and Kiro via a single source directory with symlink-based sync.

**Architecture:** Command-as-function pattern. Each command module exports a `register*` function that wires up a Commander subcommand. Commands call existing lib/ utilities (config, symlink, backup). TDD throughout.

**Tech Stack:** TypeScript, Commander.js, @inquirer/prompts, Jest/ts-jest

---

## File Structure

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/index.ts` | Register all commands |
| Create | `src/commands/setup.ts` | Interactive setup command |
| Create | `src/commands/push.ts` | Push scattered files to source |
| Create | `src/commands/sync.ts` | Create symlinks from source to tools |
| Create | `src/commands/status.ts` | Display sync state |
| Create | `src/commands/tool-presets.ts` | Tool preset definitions shared by setup and defaultConfig |
| Create | `__tests__/commands/setup.test.ts` | Tests for setup |
| Create | `__tests__/commands/push.test.ts` | Tests for push |
| Create | `__tests__/commands/sync.test.ts` | Tests for sync |
| Create | `__tests__/commands/status.test.ts` | Tests for status |

**Key existing modules (read-only, already tested):**
- `src/lib/config.ts` — `readConfig()`, `writeConfig()`, `expandHome()`, `defaultConfig`, `Config`, `ToolConfig`, `ToolMapping`
- `src/lib/symlink.ts` — `checkSymlinkState()`, `createSymlink()`, `removeSymlink()`, `SymlinkState`
- `src/lib/backup.ts` — `backupPath()`

---

### Task 1: Tool Presets Module

**Files:**
- Create: `src/commands/tool-presets.ts`
- Test: none (pure data, verified via setup tests)

This module centralizes tool preset definitions so setup and future features share one source of truth.

- [ ] **Step 1: Create tool-presets.ts**

```typescript
import { ToolConfig } from '../lib/config';

export interface ToolPreset {
  label: string;
  key: string;
  configPath: string;
  mappings: { from: string; to: string }[];
}

export const TOOL_PRESETS: ToolPreset[] = [
  {
    label: 'Claude Code',
    key: 'claude-code',
    configPath: '~/.claude',
    mappings: [
      { from: 'commands', to: 'commands' },
      { from: 'skills', to: 'skills' },
      { from: 'agents', to: 'agents' },
    ],
  },
  {
    label: 'Cursor',
    key: 'cursor',
    configPath: '~/.cursor',
    mappings: [{ from: 'commands', to: 'commands' }],
  },
  {
    label: 'Codex',
    key: 'codex',
    configPath: '~/.codex',
    mappings: [{ from: 'commands', to: 'commands' }],
  },
  {
    label: 'Kiro',
    key: 'kiro',
    configPath: '~/.kiro',
    mappings: [{ from: 'commands', to: 'commands' }],
  },
];

export const presetToToolConfig = (preset: ToolPreset): ToolConfig => ({
  enabled: true,
  configPath: preset.configPath,
  mappings: preset.mappings,
});
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/tool-presets.ts
git commit -m "feat: add tool preset definitions"
```

---

### Task 2: Setup Command

**Files:**
- Create: `src/commands/setup.ts`
- Create: `__tests__/commands/setup.test.ts`

- [ ] **Step 1: Write failing test for setup command**

Create `__tests__/commands/setup.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import * as os from 'os';
import * as path from 'path';

const loadSetupModule = (homeDir: string) => {
  jest.resetModules();
  const actualOs = jest.requireActual<typeof import('os')>('os');
  jest.doMock('os', () => ({
    ...actualOs,
    homedir: () => homeDir,
  }));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/commands/setup') as typeof import('../../src/commands/setup');
};

const loadConfigModule = (homeDir: string) => {
  jest.resetModules();
  const actualOs = jest.requireActual<typeof import('os')>('os');
  jest.doMock('os', () => ({
    ...actualOs,
    homedir: () => homeDir,
  }));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/lib/config') as typeof import('../../src/lib/config');
};

describe('setup command', () => {
  const originalHome = process.env.HOME;
  let tempHome: string;

  beforeEach(() => {
    tempHome = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-setup-'));
    process.env.HOME = tempHome;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    jest.dontMock('os');
    if (tempHome) {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test('runSetup writes config with selected tools and source', async () => {
    const { runSetup } = loadSetupModule(tempHome);
    const { getConfigPath } = loadConfigModule(tempHome);
    const sourceDir = path.join(tempHome, 'my-spells');

    const config = await runSetup(sourceDir, ['claude-code', 'cursor']);

    expect(config.source).toBe(sourceDir);
    expect(config.tools['claude-code'].enabled).toBe(true);
    expect(config.tools['claude-code'].configPath).toBe('~/.claude');
    expect(config.tools['claude-code'].mappings).toEqual([
      { from: 'commands', to: 'commands' },
      { from: 'skills', to: 'skills' },
      { from: 'agents', to: 'agents' },
    ]);
    expect(config.tools['cursor'].enabled).toBe(true);
    expect(config.tools['cursor'].configPath).toBe('~/.cursor');
    expect(config.tools['cursor'].mappings).toEqual([
      { from: 'commands', to: 'commands' },
    ]);

    // Config persisted to disk
    const raw = readFileSync(getConfigPath(), 'utf8');
    expect(JSON.parse(raw)).toEqual(config);
  });

  test('runSetup only includes selected tools', async () => {
    const { runSetup } = loadSetupModule(tempHome);
    const sourceDir = path.join(tempHome, 'spells');

    const config = await runSetup(sourceDir, ['kiro']);

    expect(Object.keys(config.tools)).toEqual(['kiro']);
    expect(config.tools['kiro'].enabled).toBe(true);
    expect(config.tools['kiro'].configPath).toBe('~/.kiro');
  });

  test('runSetup creates source directory if it does not exist', async () => {
    const { runSetup } = loadSetupModule(tempHome);
    const sourceDir = path.join(tempHome, 'new-spells-dir');

    await runSetup(sourceDir, ['claude-code']);

    expect(existsSync(sourceDir)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sammore/codeLab/sync-spells-feat-sync-spells-cli && npx jest __tests__/commands/setup.test.ts --no-cache`
Expected: FAIL — `Cannot find module '../../src/commands/setup'`

- [ ] **Step 3: Create setup.ts**

Create `src/commands/setup.ts`:

```typescript
import * as fs from 'fs/promises';
import { Command } from 'commander';
import { writeConfig, Config, ToolConfig } from '../lib/config';
import { TOOL_PRESETS, presetToToolConfig, ToolPreset } from './tool-presets';

export const runSetup = async (
  sourceDir: string,
  selectedTools: string[],
): Promise<Config> => {
  await fs.mkdir(sourceDir, { recursive: true });

  const tools: Record<string, ToolConfig> = {};
  for (const key of selectedTools) {
    const preset = TOOL_PRESETS.find((p) => p.key === key);
    if (preset) {
      tools[key] = presetToToolConfig(preset);
    }
  }

  const config: Config = { source: sourceDir, tools };
  await writeConfig(config);
  return config;
};

export const registerSetup = (program: Command): void => {
  program
    .command('setup')
    .description('Initialize sync-spells configuration')
    .action(async () => {
      const { input, checkbox } = await import('@inquirer/prompts');
      const sourceDir = await input({
        message: 'Source directory for spells:',
        default: '~/spells',
      });
      const expandedSource = sourceDir.startsWith('~/')
        ? sourceDir.replace('~', process.env.HOME || '')
        : sourceDir;

      const selectedLabels = await checkbox({
        message: 'Select tools to enable:',
        choices: TOOL_PRESETS.map((p) => ({ name: p.label, value: p.key })),
      });

      const config = await runSetup(expandedSource, selectedLabels);
      console.log(`Setup complete. Source: ${config.source}`);
      console.log(`Enabled tools: ${Object.keys(config.tools).join(', ')}`);
    });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/sammore/codeLab/sync-spells-feat-sync-spells-cli && npx jest __tests__/commands/setup.test.ts --no-cache`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/commands/setup.ts __tests__/commands/setup.test.ts
git commit -m "feat: add setup command with tests"
```

---

### Task 3: Push Command

**Files:**
- Create: `src/commands/push.ts`
- Create: `__tests__/commands/push.test.ts`

- [ ] **Step 1: Write failing test for push command**

Create `__tests__/commands/push.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import * as os from 'os';
import * as path from 'path';

const loadPushModule = (homeDir: string) => {
  jest.resetModules();
  const actualOs = jest.requireActual<typeof import('os')>('os');
  jest.doMock('os', () => ({
    ...actualOs,
    homedir: () => homeDir,
  }));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/commands/push') as typeof import('../../src/commands/push');
};

const writeTestConfig = (homeDir: string, source: string) => {
  const configDir = path.join(homeDir, '.sync-spells');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    path.join(configDir, 'config.json'),
    JSON.stringify({
      source,
      tools: {
        'claude-code': {
          enabled: true,
          configPath: '~/.claude',
          mappings: [
            { from: 'commands', to: 'commands' },
            { from: 'skills', to: 'skills' },
          ],
        },
      },
    }),
    'utf8',
  );
};

describe('push command', () => {
  const originalHome = process.env.HOME;
  let tempHome: string;

  beforeEach(() => {
    tempHome = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-push-'));
    process.env.HOME = tempHome;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    jest.dontMock('os');
    if (tempHome) {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test('runPush copies files from scanDir subdirectories to source', async () => {
    const { runPush } = loadPushModule(tempHome);
    const sourceDir = path.join(tempHome, 'source');
    const scanDir = path.join(tempHome, 'scan');
    writeTestConfig(tempHome, sourceDir);

    mkdirSync(path.join(scanDir, 'commands'), { recursive: true });
    mkdirSync(path.join(scanDir, 'skills'), { recursive: true });
    writeFileSync(path.join(scanDir, 'commands', 'commit.md'), 'commit spell', 'utf8');
    writeFileSync(path.join(scanDir, 'skills', 'tdd.md'), 'tdd skill', 'utf8');

    const result = await runPush(scanDir);

    expect(result.copied).toBe(2);
    expect(result.skipped).toBe(0);
    expect(readFileSync(path.join(sourceDir, 'commands', 'commit.md'), 'utf8')).toBe('commit spell');
    expect(readFileSync(path.join(sourceDir, 'skills', 'tdd.md'), 'utf8')).toBe('tdd skill');
  });

  test('runPush skips files that already exist in source', async () => {
    const { runPush } = loadPushModule(tempHome);
    const sourceDir = path.join(tempHome, 'source');
    const scanDir = path.join(tempHome, 'scan');
    writeTestConfig(tempHome, sourceDir);

    mkdirSync(path.join(sourceDir, 'commands'), { recursive: true });
    writeFileSync(path.join(sourceDir, 'commands', 'commit.md'), 'original', 'utf8');

    mkdirSync(path.join(scanDir, 'commands'), { recursive: true });
    writeFileSync(path.join(scanDir, 'commands', 'commit.md'), 'new version', 'utf8');

    const result = await runPush(scanDir);

    expect(result.copied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(readFileSync(path.join(sourceDir, 'commands', 'commit.md'), 'utf8')).toBe('original');
  });

  test('runPush ignores subdirectories not in any mapping', async () => {
    const { runPush } = loadPushModule(tempHome);
    const sourceDir = path.join(tempHome, 'source');
    const scanDir = path.join(tempHome, 'scan');
    writeTestConfig(tempHome, sourceDir);

    mkdirSync(path.join(scanDir, 'unrelated'), { recursive: true });
    writeFileSync(path.join(scanDir, 'unrelated', 'note.txt'), 'ignored', 'utf8');

    const result = await runPush(scanDir);

    expect(result.copied).toBe(0);
    expect(result.skipped).toBe(0);
    expect(existsSync(path.join(sourceDir, 'unrelated'))).toBe(false);
  });

  test('runPush copies nested directory structure', async () => {
    const { runPush } = loadPushModule(tempHome);
    const sourceDir = path.join(tempHome, 'source');
    const scanDir = path.join(tempHome, 'scan');
    writeTestConfig(tempHome, sourceDir);

    mkdirSync(path.join(scanDir, 'commands', 'sub'), { recursive: true });
    writeFileSync(path.join(scanDir, 'commands', 'sub', 'deep.md'), 'deep spell', 'utf8');

    const result = await runPush(scanDir);

    expect(result.copied).toBe(1);
    expect(readFileSync(path.join(sourceDir, 'commands', 'sub', 'deep.md'), 'utf8')).toBe('deep spell');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sammore/codeLab/sync-spells-feat-sync-spells-cli && npx jest __tests__/commands/push.test.ts --no-cache`
Expected: FAIL — `Cannot find module '../../src/commands/push'`

- [ ] **Step 3: Create push.ts**

Create `src/commands/push.ts`:

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { Command } from 'commander';
import { readConfig, expandHome } from '../lib/config';

interface PushResult {
  copied: number;
  skipped: number;
  skippedFiles: string[];
}

const collectSubDirs = (tools: Record<string, { mappings: { from: string }[] }>): Set<string> => {
  const dirs = new Set<string>();
  for (const tool of Object.values(tools)) {
    for (const mapping of tool.mappings) {
      dirs.add(mapping.from);
    }
  }
  return dirs;
};

export const runPush = async (scanDir: string): Promise<PushResult> => {
  const config = await readConfig();
  if (!config.source) {
    throw new Error('No source configured. Run `spells setup` first.');
  }

  const sourceDir = expandHome(config.source);
  const subDirs = collectSubDirs(config.tools);
  const result: PushResult = { copied: 0, skipped: 0, skippedFiles: [] };

  for (const subDir of subDirs) {
    const srcSubPath = path.join(scanDir, subDir);
    let entries;
    try {
      entries = await fs.readdir(srcSubPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const srcPath = path.join(srcSubPath, entry.name);
      const destPath = path.join(sourceDir, subDir, entry.name);

      try {
        await fs.access(destPath);
        result.skipped++;
        result.skippedFiles.push(path.join(subDir, entry.name));
        continue;
      } catch {
        // File does not exist in source, proceed with copy
      }

      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.cp(srcPath, destPath, { recursive: true });
      result.copied++;
    }
  }

  return result;
};

export const registerPush = (program: Command): void => {
  program
    .command('push [path]')
    .description('Push spell files from a directory into the source')
    .action(async (scanPath?: string) => {
      const dir = scanPath || process.cwd();
      const result = await runPush(dir);
      console.log(`Push complete: ${result.copied} copied, ${result.skipped} skipped.`);
      if (result.skippedFiles.length > 0) {
        console.log('Skipped (already exist):');
        for (const f of result.skippedFiles) {
          console.log(`  - ${f}`);
        }
      }
    });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/sammore/codeLab/sync-spells-feat-sync-spells-cli && npx jest __tests__/commands/push.test.ts --no-cache`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/commands/push.ts __tests__/commands/push.test.ts
git commit -m "feat: add push command with tests"
```

---

### Task 4: Sync Command

**Files:**
- Create: `src/commands/sync.ts`
- Create: `__tests__/commands/sync.test.ts`

- [ ] **Step 1: Write failing test for sync command**

Create `__tests__/commands/sync.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const loadSyncModule = (homeDir: string) => {
  jest.resetModules();
  const actualOs = jest.requireActual<typeof import('os')>('os');
  jest.doMock('os', () => ({
    ...actualOs,
    homedir: () => homeDir,
  }));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/commands/sync') as typeof import('../../src/commands/sync');
};

const writeTestConfig = (homeDir: string, source: string, tools: Record<string, unknown>) => {
  const configDir = path.join(homeDir, '.sync-spells');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    path.join(configDir, 'config.json'),
    JSON.stringify({ source, tools }),
    'utf8',
  );
};

describe('sync command', () => {
  const originalHome = process.env.HOME;
  let tempHome: string;

  beforeEach(() => {
    tempHome = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-sync-'));
    process.env.HOME = tempHome;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    jest.dontMock('os');
    if (tempHome) {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test('runSync creates symlinks for missing targets', async () => {
    const { runSync } = loadSyncModule(tempHome);
    const sourceDir = path.join(tempHome, 'source');
    const toolDir = path.join(tempHome, 'tool');
    mkdirSync(path.join(sourceDir, 'commands'), { recursive: true });
    writeFileSync(path.join(sourceDir, 'commands', 'test.md'), 'spell', 'utf8');

    writeTestConfig(tempHome, sourceDir, {
      'claude-code': {
        enabled: true,
        configPath: toolDir,
        mappings: [{ from: 'commands', to: 'commands' }],
      },
    });

    const results = await runSync();

    expect(results).toEqual([
      { tool: 'claude-code', from: 'commands', to: 'commands', action: 'linked' },
    ]);

    const linkPath = path.join(toolDir, 'commands');
    const target = await fs.readlink(linkPath);
    expect(target).toBe(path.join(sourceDir, 'commands'));
  });

  test('runSync skips already-linked targets', async () => {
    const { runSync } = loadSyncModule(tempHome);
    const sourceDir = path.join(tempHome, 'source');
    const toolDir = path.join(tempHome, 'tool');
    mkdirSync(path.join(sourceDir, 'commands'), { recursive: true });
    mkdirSync(toolDir, { recursive: true });
    await fs.symlink(path.join(sourceDir, 'commands'), path.join(toolDir, 'commands'));

    writeTestConfig(tempHome, sourceDir, {
      'claude-code': {
        enabled: true,
        configPath: toolDir,
        mappings: [{ from: 'commands', to: 'commands' }],
      },
    });

    const results = await runSync();
    expect(results).toEqual([
      { tool: 'claude-code', from: 'commands', to: 'commands', action: 'skipped' },
    ]);
  });

  test('runSync backs up and replaces real directories', async () => {
    const { runSync } = loadSyncModule(tempHome);
    const sourceDir = path.join(tempHome, 'source');
    const toolDir = path.join(tempHome, 'tool');
    mkdirSync(path.join(sourceDir, 'commands'), { recursive: true });
    mkdirSync(path.join(toolDir, 'commands'), { recursive: true });
    writeFileSync(path.join(toolDir, 'commands', 'old.md'), 'old content', 'utf8');

    writeTestConfig(tempHome, sourceDir, {
      'claude-code': {
        enabled: true,
        configPath: toolDir,
        mappings: [{ from: 'commands', to: 'commands' }],
      },
    });

    const results = await runSync();
    expect(results).toEqual([
      { tool: 'claude-code', from: 'commands', to: 'commands', action: 'backed-up' },
    ]);

    // Old content backed up somewhere
    const linkPath = path.join(toolDir, 'commands');
    const target = await fs.readlink(linkPath);
    expect(target).toBe(path.join(sourceDir, 'commands'));
  });

  test('runSync fixes broken symlinks', async () => {
    const { runSync } = loadSyncModule(tempHome);
    const sourceDir = path.join(tempHome, 'source');
    const toolDir = path.join(tempHome, 'tool');
    mkdirSync(path.join(sourceDir, 'commands'), { recursive: true });
    mkdirSync(toolDir, { recursive: true });
    await fs.symlink('/nonexistent/path', path.join(toolDir, 'commands'));

    writeTestConfig(tempHome, sourceDir, {
      'claude-code': {
        enabled: true,
        configPath: toolDir,
        mappings: [{ from: 'commands', to: 'commands' }],
      },
    });

    const results = await runSync();
    expect(results).toEqual([
      { tool: 'claude-code', from: 'commands', to: 'commands', action: 're-linked' },
    ]);

    const target = await fs.readlink(path.join(toolDir, 'commands'));
    expect(target).toBe(path.join(sourceDir, 'commands'));
  });

  test('runSync fixes wrong-target symlinks', async () => {
    const { runSync } = loadSyncModule(tempHome);
    const sourceDir = path.join(tempHome, 'source');
    const wrongDir = path.join(tempHome, 'wrong');
    const toolDir = path.join(tempHome, 'tool');
    mkdirSync(path.join(sourceDir, 'commands'), { recursive: true });
    mkdirSync(path.join(wrongDir, 'commands'), { recursive: true });
    mkdirSync(toolDir, { recursive: true });
    await fs.symlink(path.join(wrongDir, 'commands'), path.join(toolDir, 'commands'));

    writeTestConfig(tempHome, sourceDir, {
      'claude-code': {
        enabled: true,
        configPath: toolDir,
        mappings: [{ from: 'commands', to: 'commands' }],
      },
    });

    const results = await runSync();
    expect(results).toEqual([
      { tool: 'claude-code', from: 'commands', to: 'commands', action: 're-linked' },
    ]);
  });

  test('runSync skips disabled tools', async () => {
    const { runSync } = loadSyncModule(tempHome);
    const sourceDir = path.join(tempHome, 'source');
    mkdirSync(path.join(sourceDir, 'commands'), { recursive: true });

    writeTestConfig(tempHome, sourceDir, {
      'claude-code': {
        enabled: false,
        configPath: path.join(tempHome, 'tool'),
        mappings: [{ from: 'commands', to: 'commands' }],
      },
    });

    const results = await runSync();
    expect(results).toEqual([]);
  });

  test('runSync skips when source subdirectory does not exist', async () => {
    const { runSync } = loadSyncModule(tempHome);
    const sourceDir = path.join(tempHome, 'source');
    mkdirSync(sourceDir, { recursive: true });

    writeTestConfig(tempHome, sourceDir, {
      'claude-code': {
        enabled: true,
        configPath: path.join(tempHome, 'tool'),
        mappings: [{ from: 'commands', to: 'commands' }],
      },
    });

    const results = await runSync();
    expect(results).toEqual([
      { tool: 'claude-code', from: 'commands', to: 'commands', action: 'skipped' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sammore/codeLab/sync-spells-feat-sync-spells-cli && npx jest __tests__/commands/sync.test.ts --no-cache`
Expected: FAIL — `Cannot find module '../../src/commands/sync'`

- [ ] **Step 3: Create sync.ts**

Create `src/commands/sync.ts`:

```typescript
import * as path from 'path';
import { Command } from 'commander';
import { readConfig, expandHome } from '../lib/config';
import { checkSymlinkState, createSymlink, removeSymlink } from '../lib/symlink';
import { backupPath } from '../lib/backup';

interface SyncResult {
  tool: string;
  from: string;
  to: string;
  action: 'linked' | 'skipped' | 'backed-up' | 're-linked';
}

export const runSync = async (): Promise<SyncResult[]> => {
  const config = await readConfig();
  if (!config.source) {
    throw new Error('No source configured. Run `spells setup` first.');
  }

  const sourceDir = expandHome(config.source);
  const results: SyncResult[] = [];

  for (const [toolKey, toolConfig] of Object.entries(config.tools)) {
    if (!toolConfig.enabled) {
      continue;
    }

    const toolBase = expandHome(toolConfig.configPath);

    for (const mapping of toolConfig.mappings) {
      const sourcePath = path.join(sourceDir, mapping.from);
      const targetPath = path.join(toolBase, mapping.to);

      try {
        const { access } = await import('fs/promises');
        await access(sourcePath);
      } catch {
        results.push({ tool: toolKey, from: mapping.from, to: mapping.to, action: 'skipped' });
        continue;
      }

      const state = await checkSymlinkState(targetPath, sourcePath);

      switch (state) {
        case 'linked':
          results.push({ tool: toolKey, from: mapping.from, to: mapping.to, action: 'skipped' });
          break;

        case 'missing':
          await createSymlink(sourcePath, targetPath);
          results.push({ tool: toolKey, from: mapping.from, to: mapping.to, action: 'linked' });
          break;

        case 'real-dir':
          await backupPath(targetPath);
          await createSymlink(sourcePath, targetPath);
          results.push({ tool: toolKey, from: mapping.from, to: mapping.to, action: 'backed-up' });
          break;

        case 'broken':
        case 'wrong-target':
          await removeSymlink(targetPath);
          await createSymlink(sourcePath, targetPath);
          results.push({ tool: toolKey, from: mapping.from, to: mapping.to, action: 're-linked' });
          break;
      }
    }
  }

  return results;
};

export const registerSync = (program: Command): void => {
  program
    .command('sync')
    .description('Sync spells from source to all enabled tools')
    .action(async () => {
      const results = await runSync();
      for (const r of results) {
        const icon = r.action === 'skipped' ? '=' : '+';
        console.log(`  ${icon} [${r.tool}] ${r.from} → ${r.to}: ${r.action}`);
      }
      const changed = results.filter((r) => r.action !== 'skipped').length;
      console.log(`\nSync complete: ${changed} updated, ${results.length - changed} unchanged.`);
    });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/sammore/codeLab/sync-spells-feat-sync-spells-cli && npx jest __tests__/commands/sync.test.ts --no-cache`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/commands/sync.ts __tests__/commands/sync.test.ts
git commit -m "feat: add sync command with tests"
```

---

### Task 5: Status Command

**Files:**
- Create: `src/commands/status.ts`
- Create: `__tests__/commands/status.test.ts`

- [ ] **Step 1: Write failing test for status command**

Create `__tests__/commands/status.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const loadStatusModule = (homeDir: string) => {
  jest.resetModules();
  const actualOs = jest.requireActual<typeof import('os')>('os');
  jest.doMock('os', () => ({
    ...actualOs,
    homedir: () => homeDir,
  }));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/commands/status') as typeof import('../../src/commands/status');
};

const writeTestConfig = (homeDir: string, source: string, tools: Record<string, unknown>) => {
  const configDir = path.join(homeDir, '.sync-spells');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    path.join(configDir, 'config.json'),
    JSON.stringify({ source, tools }),
    'utf8',
  );
};

describe('status command', () => {
  const originalHome = process.env.HOME;
  let tempHome: string;

  beforeEach(() => {
    tempHome = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-status-'));
    process.env.HOME = tempHome;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    jest.dontMock('os');
    if (tempHome) {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test('runStatus reports linked state', async () => {
    const { runStatus } = loadStatusModule(tempHome);
    const sourceDir = path.join(tempHome, 'source');
    const toolDir = path.join(tempHome, 'tool');
    mkdirSync(path.join(sourceDir, 'commands'), { recursive: true });
    mkdirSync(toolDir, { recursive: true });
    await fs.symlink(path.join(sourceDir, 'commands'), path.join(toolDir, 'commands'));

    writeTestConfig(tempHome, sourceDir, {
      'claude-code': {
        enabled: true,
        configPath: toolDir,
        mappings: [{ from: 'commands', to: 'commands' }],
      },
    });

    const entries = await runStatus();
    expect(entries).toEqual([
      { tool: 'claude-code', from: 'commands', to: 'commands', state: 'linked' },
    ]);
  });

  test('runStatus reports missing state', async () => {
    const { runStatus } = loadStatusModule(tempHome);
    const sourceDir = path.join(tempHome, 'source');
    const toolDir = path.join(tempHome, 'tool');
    mkdirSync(path.join(sourceDir, 'commands'), { recursive: true });

    writeTestConfig(tempHome, sourceDir, {
      'claude-code': {
        enabled: true,
        configPath: toolDir,
        mappings: [{ from: 'commands', to: 'commands' }],
      },
    });

    const entries = await runStatus();
    expect(entries).toEqual([
      { tool: 'claude-code', from: 'commands', to: 'commands', state: 'missing' },
    ]);
  });

  test('runStatus reports real-dir state', async () => {
    const { runStatus } = loadStatusModule(tempHome);
    const sourceDir = path.join(tempHome, 'source');
    const toolDir = path.join(tempHome, 'tool');
    mkdirSync(path.join(sourceDir, 'commands'), { recursive: true });
    mkdirSync(path.join(toolDir, 'commands'), { recursive: true });

    writeTestConfig(tempHome, sourceDir, {
      'claude-code': {
        enabled: true,
        configPath: toolDir,
        mappings: [{ from: 'commands', to: 'commands' }],
      },
    });

    const entries = await runStatus();
    expect(entries).toEqual([
      { tool: 'claude-code', from: 'commands', to: 'commands', state: 'real-dir' },
    ]);
  });

  test('runStatus skips disabled tools', async () => {
    const { runStatus } = loadStatusModule(tempHome);
    const sourceDir = path.join(tempHome, 'source');
    mkdirSync(path.join(sourceDir, 'commands'), { recursive: true });

    writeTestConfig(tempHome, sourceDir, {
      'claude-code': {
        enabled: false,
        configPath: path.join(tempHome, 'tool'),
        mappings: [{ from: 'commands', to: 'commands' }],
      },
    });

    const entries = await runStatus();
    expect(entries).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sammore/codeLab/sync-spells-feat-sync-spells-cli && npx jest __tests__/commands/status.test.ts --no-cache`
Expected: FAIL — `Cannot find module '../../src/commands/status'`

- [ ] **Step 3: Create status.ts**

Create `src/commands/status.ts`:

```typescript
import * as path from 'path';
import { Command } from 'commander';
import { readConfig, expandHome } from '../lib/config';
import { checkSymlinkState, SymlinkState } from '../lib/symlink';

interface StatusEntry {
  tool: string;
  from: string;
  to: string;
  state: SymlinkState;
}

export const runStatus = async (): Promise<StatusEntry[]> => {
  const config = await readConfig();
  if (!config.source) {
    throw new Error('No source configured. Run `spells setup` first.');
  }

  const sourceDir = expandHome(config.source);
  const entries: StatusEntry[] = [];

  for (const [toolKey, toolConfig] of Object.entries(config.tools)) {
    if (!toolConfig.enabled) {
      continue;
    }

    const toolBase = expandHome(toolConfig.configPath);

    for (const mapping of toolConfig.mappings) {
      const sourcePath = path.join(sourceDir, mapping.from);
      const targetPath = path.join(toolBase, mapping.to);
      const state = await checkSymlinkState(targetPath, sourcePath);
      entries.push({ tool: toolKey, from: mapping.from, to: mapping.to, state });
    }
  }

  return entries;
};

export const registerStatus = (program: Command): void => {
  program
    .command('status')
    .description('Show sync status for all tool mappings')
    .action(async () => {
      const entries = await runStatus();
      for (const entry of entries) {
        console.log(`  [${entry.tool}] ${entry.from} → ${entry.to}: ${entry.state}`);
      }
      if (entries.length === 0) {
        console.log('No enabled tools. Run `spells setup` to configure.');
      }
    });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/sammore/codeLab/sync-spells-feat-sync-spells-cli && npx jest __tests__/commands/status.test.ts --no-cache`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/commands/status.ts __tests__/commands/status.test.ts
git commit -m "feat: add status command with tests"
```

---

### Task 6: Wire Commands into index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Update index.ts to register all commands**

Replace the contents of `src/index.ts` with:

```typescript
import { Command } from 'commander';
import { registerSetup } from './commands/setup';
import { registerPush } from './commands/push';
import { registerSync } from './commands/sync';
import { registerStatus } from './commands/status';

const program = new Command();

program
  .name('spells')
  .description('Unified management of AI agent spells')
  .version('1.0.0');

registerSetup(program);
registerPush(program);
registerSync(program);
registerStatus(program);

program.parse(process.argv);
```

- [ ] **Step 2: Verify build succeeds**

Run: `cd /Users/sammore/codeLab/sync-spells-feat-sync-spells-cli && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run all tests**

Run: `cd /Users/sammore/codeLab/sync-spells-feat-sync-spells-cli && npx jest --no-cache`
Expected: All tests pass (lib + commands)

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire all commands into CLI entry point"
```

---

### Task 7: Final Validation

- [ ] **Step 1: Run full test suite**

Run: `cd /Users/sammore/codeLab/sync-spells-feat-sync-spells-cli && npx jest --no-cache --verbose`
Expected: All tests pass

- [ ] **Step 2: Build the project**

Run: `cd /Users/sammore/codeLab/sync-spells-feat-sync-spells-cli && npx tsc`
Expected: Build succeeds with output in `dist/`

- [ ] **Step 3: Verify CLI help output**

Run: `cd /Users/sammore/codeLab/sync-spells-feat-sync-spells-cli && npx ts-node src/index.ts --help`
Expected: Shows `setup`, `push`, `sync`, `status` subcommands

- [ ] **Step 4: Remove .gitkeep files**

```bash
rm -f src/commands/.gitkeep __tests__/commands/.gitkeep __tests__/lib/.gitkeep src/lib/.gitkeep
git add -u
git commit -m "chore: remove .gitkeep placeholders"
```
