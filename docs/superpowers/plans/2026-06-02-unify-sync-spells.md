# Unify Sync-Spells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `spells` CLI the single control plane over the iCloud `sync-spells/` storage backend by adding cross-tool agent format adaptation, a workspace manifest with a `spells workspace` command namespace, and removing confirmed-deprecated legacy artifacts.

**Architecture:** Four phases. (1) Config/type foundation — extend `ToolConfig` with an optional agent target and add a `workspace.json` manifest library. (2) `spells workspace` commands (init/doctor/migrate). (3) Agents adapter — a frontmatter parser plus `toToml`/`toJson` converters, integrated into sync via a separate agents pass that reuses the existing symlink state machine for `.md` passthrough. (4) Mechanical legacy cleanup in the iCloud data repo.

**Tech Stack:** TypeScript, Node `fs/promises`, Commander, Jest + ts-jest. Tests use `@jest/globals`, `mkdtempSync` temp dirs, and an `os.homedir` spy (see `__tests__/lib/config.test.ts`).

Spec: `docs/superpowers/specs/2026-06-02-unify-sync-spells-design.md`

---

## Phase 1 — Config & Type Foundation

### Task 1: Workspace manifest library

**Files:**
- Create: `src/lib/workspace.ts`
- Test: `__tests__/lib/workspace.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/workspace.test.ts
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  defaultManifest,
  readManifest,
  writeManifest,
  MANIFEST_FILE,
} from '../../src/lib/workspace';

describe('workspace manifest', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-ws-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('readManifest returns defaultManifest when file is absent', async () => {
    await expect(readManifest(root)).resolves.toEqual(defaultManifest);
  });

  test('writeManifest then readManifest round-trips', async () => {
    const manifest = { ...defaultManifest, legacy: ['legacy-commands'] };
    await writeManifest(root, manifest);
    await expect(readManifest(root)).resolves.toEqual(manifest);
  });

  test('readManifest falls back to default for malformed manifest', async () => {
    await writeFile(path.join(root, MANIFEST_FILE), JSON.stringify({ version: 'x' }), 'utf8');
    await expect(readManifest(root)).resolves.toEqual(defaultManifest);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/lib/workspace.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/workspace'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/workspace.ts
import * as fs from 'fs/promises';
import * as path from 'path';

export interface WorkspaceManifest {
  version: number;
  library: string;
  profiles: string;
  agents: string;
  legacy: string[];
}

export const MANIFEST_FILE = 'workspace.json';

export const defaultManifest: WorkspaceManifest = {
  version: 1,
  library: 'skill-category',
  profiles: 'profiles',
  agents: 'agents',
  legacy: [],
};

const isWorkspaceManifest = (value: unknown): value is WorkspaceManifest => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const m = value as Partial<WorkspaceManifest>;
  return (
    typeof m.version === 'number' &&
    typeof m.library === 'string' &&
    typeof m.profiles === 'string' &&
    typeof m.agents === 'string' &&
    Array.isArray(m.legacy) &&
    m.legacy.every((e) => typeof e === 'string')
  );
};

export const manifestPath = (root: string): string => path.join(root, MANIFEST_FILE);

export const readManifest = async (root: string): Promise<WorkspaceManifest> => {
  try {
    const raw = await fs.readFile(manifestPath(root), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return isWorkspaceManifest(parsed) ? parsed : { ...defaultManifest };
  } catch {
    return { ...defaultManifest };
  }
};

export const writeManifest = async (root: string, manifest: WorkspaceManifest): Promise<void> => {
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(manifestPath(root), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/lib/workspace.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/workspace.ts __tests__/lib/workspace.test.ts
git commit -m "feat(workspace): add workspace.json manifest library"
```

---

### Task 2: Extend ToolConfig with an agent target

**Files:**
- Modify: `src/lib/config.ts` (add `AgentTarget`, extend `ToolConfig`, extend `isToolConfig`, extend `defaultConfig`)
- Test: `__tests__/lib/config.test.ts` (append cases)

- [ ] **Step 1: Write the failing test (append to the existing `describe('config module', ...)`)**

```typescript
  test('readConfig accepts a tool with an agents target', async () => {
    const { readConfig, getConfigPath } = loadConfigModule();
    const saved = {
      source: 'disk',
      tools: {
        codex: {
          enabled: true,
          configPath: '~/.codex',
          mappings: [],
          agents: { path: '~/.codex/agents', format: 'toml' },
        },
      },
    };
    const configPath = getConfigPath();
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(saved, null, 2), 'utf8');

    await expect(readConfig()).resolves.toEqual(saved);
  });

  test('readConfig rejects a tool whose agents target has an invalid format', async () => {
    const { readConfig, defaultConfig, getConfigPath } = loadConfigModule();
    const saved = {
      source: 'disk',
      tools: {
        codex: {
          enabled: true,
          configPath: '~/.codex',
          mappings: [],
          agents: { path: '~/.codex/agents', format: 'yaml' },
        },
      },
    };
    const configPath = getConfigPath();
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(saved, null, 2), 'utf8');

    await expect(readConfig()).resolves.toEqual(defaultConfig);
  });

  test('defaultConfig wires agent targets for claude-code, codex, cursor, and kiro', () => {
    const { defaultConfig } = loadConfigModule();
    expect(defaultConfig.tools['claude-code'].agents).toEqual({ path: '~/.claude/agents', format: 'md' });
    expect(defaultConfig.tools.codex.agents).toEqual({ path: '~/.codex/agents', format: 'toml' });
    expect(defaultConfig.tools.cursor.agents).toEqual({ path: '~/.cursor/agents', format: 'md' });
    expect(defaultConfig.tools.kiro.agents).toEqual({ path: '~/.kiro/agents', format: 'json' });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/lib/config.test.ts`
Expected: FAIL — the agents target is stripped (config rejected → falls back to default) and `defaultConfig.tools.kiro` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/config.ts`, add the `AgentTarget` interface above `ToolConfig`:

```typescript
export type AgentFormat = 'md' | 'toml' | 'json';

export interface AgentTarget {
  path: string;
  format: AgentFormat;
}
```

Extend `ToolConfig`:

```typescript
export interface ToolConfig {
  enabled: boolean;
  configPath: string;
  mappings: ToolMapping[];
  agents?: AgentTarget;
}
```

Add an `isAgentTarget` guard above `isToolConfig`:

```typescript
const isAgentTarget = (value: unknown): value is AgentTarget => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const t = value as Partial<AgentTarget>;
  return (
    typeof t.path === 'string' &&
    (t.format === 'md' || t.format === 'toml' || t.format === 'json')
  );
};
```

Extend `isToolConfig` to validate the optional field:

```typescript
const isToolConfig = (value: unknown): value is ToolConfig => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const config = value as Partial<ToolConfig>;
  return (
    typeof config.enabled === 'boolean' &&
    typeof config.configPath === 'string' &&
    Array.isArray(config.mappings) &&
    config.mappings.every(isToolMapping) &&
    (config.agents === undefined || isAgentTarget(config.agents))
  );
};
```

Replace `defaultConfig` with:

```typescript
export const defaultConfig: Config = {
  source: '',
  tools: {
    'claude-code': { enabled: true, configPath: '~/.claude', mappings: [{ from: 'global', to: 'skills' }], agents: { path: '~/.claude/agents', format: 'md' } },
    'agents':      { enabled: true, configPath: '~/.agents', mappings: [{ from: 'global', to: 'skills' }] },
    'codex':       { enabled: true, configPath: '~/.codex',  mappings: [{ from: 'global', to: 'skills' }], agents: { path: '~/.codex/agents', format: 'toml' } },
    'cursor':      { enabled: true, configPath: '~/.cursor', mappings: [{ from: 'global', to: 'skills' }], agents: { path: '~/.cursor/agents', format: 'md' } },
    'kiro':        { enabled: true, configPath: '~/.kiro',   mappings: [], agents: { path: '~/.kiro/agents', format: 'json' } },
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/lib/config.test.ts`
Expected: PASS (existing cases + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/config.ts __tests__/lib/config.test.ts
git commit -m "feat(config): add optional agent target to ToolConfig and wire defaults"
```

---

## Phase 2 — Workspace Commands

### Task 3: `runWorkspaceInit` + `spells workspace init`

**Files:**
- Create: `src/commands/workspace.ts`
- Modify: `src/index.ts` (register the command)
- Test: `__tests__/commands/workspace.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/commands/workspace.test.ts
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { readFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { runWorkspaceInit } from '../../src/commands/workspace';
import { defaultManifest, MANIFEST_FILE } from '../../src/lib/workspace';

describe('workspace init', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-wsinit-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('writes default manifest and reports created', async () => {
    const result = await runWorkspaceInit(root);
    expect(result.action).toBe('created');
    const raw = await readFile(path.join(root, MANIFEST_FILE), 'utf8');
    expect(JSON.parse(raw)).toEqual(defaultManifest);
  });

  test('is idempotent — second run reports unchanged', async () => {
    await runWorkspaceInit(root);
    const result = await runWorkspaceInit(root);
    expect(result.action).toBe('unchanged');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/commands/workspace.test.ts`
Expected: FAIL — `Cannot find module '../../src/commands/workspace'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/commands/workspace.ts
import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config, expandHome } from '../lib/config';
import {
  WorkspaceManifest,
  defaultManifest,
  manifestPath,
  readManifest,
  writeManifest,
} from '../lib/workspace';

export interface WorkspaceInitResult {
  root: string;
  action: 'created' | 'unchanged';
}

export const runWorkspaceInit = async (root: string): Promise<WorkspaceInitResult> => {
  try {
    await fs.access(manifestPath(root));
    return { root, action: 'unchanged' };
  } catch {
    await writeManifest(root, { ...defaultManifest });
    return { root, action: 'created' };
  }
};

export const registerWorkspace = (program: Command, getConfig: () => Promise<Config>): void => {
  const ws = program.command('workspace').description('Manage the iCloud sync-spells workspace');

  ws.command('init')
    .description('Write workspace.json into the configured workspace root')
    .action(async () => {
      const config = await getConfig();
      const root = expandHome(config.source);
      const result = await runWorkspaceInit(root);
      console.log(`  ${result.action === 'created' ? '+' : '='} workspace.json: ${result.action} (${result.root})`);
    });
};
```

Register it in `src/index.ts`. Add the import near the other command imports:

```typescript
import { registerWorkspace } from './commands/workspace';
```

Add the registration call after `registerBind(program);`:

```typescript
registerWorkspace(program, readConfig);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/commands/workspace.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/commands/workspace.ts src/index.ts __tests__/commands/workspace.test.ts
git commit -m "feat(workspace): add 'spells workspace init' command"
```

---

### Task 4: `runWorkspaceDoctor` + `spells workspace doctor`

Validates that every manifest-declared directory exists and that each tool's skill symlink target resolves (this surfaces the known broken `skills-registry/global` mismatch).

**Files:**
- Modify: `src/commands/workspace.ts` (add `runWorkspaceDoctor` + `doctor` subcommand)
- Test: `__tests__/commands/workspace.test.ts` (append a `describe('workspace doctor', ...)`)

- [ ] **Step 1: Write the failing test**

```typescript
// append to __tests__/commands/workspace.test.ts
import { mkdir, symlink } from 'fs/promises';
import { runWorkspaceDoctor } from '../../src/commands/workspace';
import { writeManifest, defaultManifest } from '../../src/lib/workspace';

describe('workspace doctor', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-wsdoc-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('reports error for a manifest directory that is missing', async () => {
    await writeManifest(root, { ...defaultManifest });
    const config = { source: root, tools: {} };
    const results = await runWorkspaceDoctor(config, root);
    const lib = results.find((r) => r.check === 'dir:skill-category');
    expect(lib?.status).toBe('error');
  });

  test('reports ok when all manifest directories exist', async () => {
    await writeManifest(root, { ...defaultManifest });
    await mkdir(path.join(root, 'skill-category'));
    await mkdir(path.join(root, 'profiles'));
    await mkdir(path.join(root, 'agents'));
    const config = { source: root, tools: {} };
    const results = await runWorkspaceDoctor(config, root);
    expect(results.filter((r) => r.check.startsWith('dir:')).every((r) => r.status === 'ok')).toBe(true);
  });

  test('reports error for a broken tool skill symlink', async () => {
    await writeManifest(root, { ...defaultManifest });
    await mkdir(path.join(root, 'skill-category'));
    await mkdir(path.join(root, 'profiles'));
    await mkdir(path.join(root, 'agents'));
    const toolBase = path.join(root, 'fake-claude');
    await mkdir(toolBase, { recursive: true });
    await symlink(path.join(root, 'does-not-exist'), path.join(toolBase, 'skills'));
    const config = {
      source: root,
      tools: { 'claude-code': { enabled: true, configPath: toolBase, mappings: [{ from: 'global', to: 'skills' }] } },
    };
    const results = await runWorkspaceDoctor(config, root);
    const link = results.find((r) => r.check === 'symlink:claude-code:skills');
    expect(link?.status).toBe('error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/commands/workspace.test.ts`
Expected: FAIL — `runWorkspaceDoctor` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/commands/workspace.ts` — extend the imports at the top:

```typescript
import { checkSymlinkState } from '../lib/symlink';
```

Add the result type and function:

```typescript
export interface WorkspaceDoctorResult {
  check: string;
  status: 'ok' | 'warn' | 'error';
  message: string;
}

export const runWorkspaceDoctor = async (
  config: Config,
  root: string,
): Promise<WorkspaceDoctorResult[]> => {
  const results: WorkspaceDoctorResult[] = [];
  const manifest = await readManifest(root);

  for (const dir of [manifest.library, manifest.profiles, manifest.agents]) {
    const full = path.join(root, dir);
    try {
      await fs.access(full);
      results.push({ check: `dir:${dir}`, status: 'ok', message: `directory exists: ${dir}` });
    } catch {
      results.push({ check: `dir:${dir}`, status: 'error', message: `missing directory: ${dir}` });
    }
  }

  for (const [toolKey, toolConfig] of Object.entries(config.tools)) {
    if (!toolConfig.enabled) {
      continue;
    }
    const toolBase = expandHome(toolConfig.configPath);
    for (const mapping of toolConfig.mappings) {
      const expected = path.join(expandHome(config.source), mapping.from);
      const target = path.join(toolBase, mapping.to);
      const state = await checkSymlinkState(target, expected);
      if (state === 'broken' || state === 'wrong-target') {
        results.push({
          check: `symlink:${toolKey}:${mapping.to}`,
          status: 'error',
          message: `symlink ${target} is ${state} (expected → ${expected}); run "spells sync" to repair`,
        });
      } else {
        results.push({
          check: `symlink:${toolKey}:${mapping.to}`,
          status: 'ok',
          message: `symlink ${toolKey}:${mapping.to} is ${state}`,
        });
      }
    }
  }

  return results;
};
```

Add the `doctor` subcommand inside `registerWorkspace`, after the `init` subcommand:

```typescript
  ws.command('doctor')
    .description('Validate workspace directories and tool symlink health')
    .action(async () => {
      const config = await getConfig();
      const root = expandHome(config.source);
      const results = await runWorkspaceDoctor(config, root);
      for (const r of results) {
        const icon = r.status === 'ok' ? '✓' : r.status === 'warn' ? '⚠' : '✗';
        console.log(`  ${icon} ${r.message}`);
      }
      const hasErrors = results.some((r) => r.status === 'error');
      console.log(`\n${hasErrors ? '✗ Workspace issues found' : '✓ Workspace healthy'}\n`);
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/commands/workspace.test.ts`
Expected: PASS (init 2 + doctor 3).

- [ ] **Step 5: Commit**

```bash
git add src/commands/workspace.ts __tests__/commands/workspace.test.ts
git commit -m "feat(workspace): add 'spells workspace doctor' with symlink health checks"
```

---

### Task 5: `runWorkspaceMigrate` + `spells workspace migrate`

Creates any manifest-declared directory that is missing so the on-disk workspace conforms to the manifest. (Renaming legacy directory aliases and symlink repair are out of scope; `doctor` reports those, `sync` repairs symlinks.)

**Files:**
- Modify: `src/commands/workspace.ts` (add `runWorkspaceMigrate` + `migrate` subcommand)
- Test: `__tests__/commands/workspace.test.ts` (append a `describe('workspace migrate', ...)`)

- [ ] **Step 1: Write the failing test**

```typescript
// append to __tests__/commands/workspace.test.ts
import { access } from 'fs/promises';
import { runWorkspaceMigrate } from '../../src/commands/workspace';

describe('workspace migrate', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-wsmig-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('creates missing manifest directories and reports them', async () => {
    await writeManifest(root, { ...defaultManifest });
    const result = await runWorkspaceMigrate(root);
    expect(result.created.sort()).toEqual(['agents', 'profiles', 'skill-category']);
    await expect(access(path.join(root, 'skill-category'))).resolves.toBeUndefined();
    await expect(access(path.join(root, 'agents'))).resolves.toBeUndefined();
    await expect(access(path.join(root, 'profiles'))).resolves.toBeUndefined();
  });

  test('creates nothing when all directories already exist', async () => {
    await writeManifest(root, { ...defaultManifest });
    await mkdir(path.join(root, 'skill-category'));
    await mkdir(path.join(root, 'profiles'));
    await mkdir(path.join(root, 'agents'));
    const result = await runWorkspaceMigrate(root);
    expect(result.created).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/commands/workspace.test.ts`
Expected: FAIL — `runWorkspaceMigrate` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/commands/workspace.ts`:

```typescript
export interface WorkspaceMigrateResult {
  root: string;
  created: string[];
}

export const runWorkspaceMigrate = async (root: string): Promise<WorkspaceMigrateResult> => {
  const manifest = await readManifest(root);
  const created: string[] = [];

  for (const dir of [manifest.library, manifest.profiles, manifest.agents]) {
    const full = path.join(root, dir);
    try {
      await fs.access(full);
    } catch {
      await fs.mkdir(full, { recursive: true });
      created.push(dir);
    }
  }

  return { root, created: created.sort() };
};
```

Add the `migrate` subcommand inside `registerWorkspace`, after the `doctor` subcommand:

```typescript
  ws.command('migrate')
    .description('Create any missing manifest-declared directories')
    .action(async () => {
      const config = await getConfig();
      const root = expandHome(config.source);
      const result = await runWorkspaceMigrate(root);
      if (result.created.length === 0) {
        console.log('  = workspace already conforms to manifest');
      } else {
        for (const dir of result.created) {
          console.log(`  + created ${dir}`);
        }
      }
    });
```

Note: the unused `WorkspaceManifest` import added in Task 1 usage may now be referenced; if `tsc` flags an unused import, remove `WorkspaceManifest` from the import list in `workspace.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/commands/workspace.test.ts`
Expected: PASS (init 2 + doctor 3 + migrate 2).

- [ ] **Step 5: Commit**

```bash
git add src/commands/workspace.ts __tests__/commands/workspace.test.ts
git commit -m "feat(workspace): add 'spells workspace migrate' to create missing dirs"
```

---

## Phase 3 — Agents Adapter

### Task 6: Agent frontmatter parser + type guard

**Files:**
- Create: `src/lib/agent.ts`
- Test: `__tests__/lib/agent.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/agent.test.ts
import { describe, expect, test } from '@jest/globals';
import { parseAgentFile, isAgentFrontmatter } from '../../src/lib/agent';

const SAMPLE = `---
name: git-executor
description: "Use when running git operations"
model: sonnet
tools: "Skill, Read, Bash"
color: blue
---

Agent instructions here.
Second line.
`;

describe('parseAgentFile', () => {
  test('parses frontmatter and body', () => {
    const { data, body } = parseAgentFile(SAMPLE);
    expect(data.name).toBe('git-executor');
    expect(data.description).toBe('Use when running git operations');
    expect(data.model).toBe('sonnet');
    expect(data.tools).toBe('Skill, Read, Bash');
    expect(body).toBe('Agent instructions here.\nSecond line.\n');
  });

  test('throws when frontmatter is missing', () => {
    expect(() => parseAgentFile('no frontmatter here')).toThrow('missing frontmatter');
  });

  test('throws when name is missing', () => {
    expect(() => parseAgentFile('---\ndescription: x\n---\nbody')).toThrow('missing name');
  });

  test('throws when description is missing', () => {
    expect(() => parseAgentFile('---\nname: x\n---\nbody')).toThrow('missing description');
  });
});

describe('isAgentFrontmatter', () => {
  test('accepts a valid object', () => {
    expect(isAgentFrontmatter({ name: 'a', description: 'b' })).toBe(true);
  });

  test('rejects when description is absent', () => {
    expect(isAgentFrontmatter({ name: 'a' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/lib/agent.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/agent'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/agent.ts
export interface AgentFrontmatter {
  name: string;
  description: string;
  model?: string;
  tools?: string;
  color?: string;
}

export const isAgentFrontmatter = (value: unknown): value is AgentFrontmatter => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const f = value as Partial<AgentFrontmatter>;
  return typeof f.name === 'string' && typeof f.description === 'string';
};

export const parseAgentFile = (content: string): { data: AgentFrontmatter; body: string } => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error('missing frontmatter');
  }

  const data: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }
    const idx = line.indexOf(':');
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }

  if (!data.name) {
    throw new Error('missing name');
  }
  if (!data.description) {
    throw new Error('missing description');
  }

  return { data: data as unknown as AgentFrontmatter, body: match[2].trimEnd() + '\n' };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/lib/agent.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent.ts __tests__/lib/agent.test.ts
git commit -m "feat(agent): add canonical agent frontmatter parser and guard"
```

---

### Task 7: `toToml` and `toJson` converters

**Files:**
- Modify: `src/lib/agent.ts` (add `toToml`, `toJson`)
- Test: `__tests__/lib/agent.test.ts` (append)

- [ ] **Step 1: Write the failing test**

```typescript
// append to __tests__/lib/agent.test.ts
import { toToml, toJson } from '../../src/lib/agent';

describe('toToml', () => {
  test('emits name, description, model, and developer_instructions', () => {
    const out = toToml(
      { name: 'git-executor', description: 'desc', model: 'opus', tools: 'Read' },
      'body line one\nbody line two\n',
    );
    expect(out).toContain('name = "git-executor"');
    expect(out).toContain('description = "desc"');
    expect(out).toContain('model = "opus"');
    expect(out).toContain('developer_instructions = """body line one\nbody line two\n"""');
  });

  test('defaults model to sonnet when absent', () => {
    const out = toToml({ name: 'a', description: 'b' }, 'x\n');
    expect(out).toContain('model = "sonnet"');
  });
});

describe('toJson', () => {
  test('emits name, description, prompt, model and splits tools into an array', () => {
    const out = toJson(
      { name: 'jira', description: 'desc', model: 'sonnet', tools: 'Skill, Read, Bash' },
      'prompt body\n',
    );
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({
      name: 'jira',
      description: 'desc',
      model: 'sonnet',
      prompt: 'prompt body\n',
      tools: ['Skill', 'Read', 'Bash'],
    });
  });

  test('omits tools when frontmatter has none', () => {
    const parsed = JSON.parse(toJson({ name: 'a', description: 'b' }, 'p\n'));
    expect(parsed.tools).toBeUndefined();
    expect(parsed.model).toBe('sonnet');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/lib/agent.test.ts`
Expected: FAIL — `toToml` / `toJson` are not exported.

- [ ] **Step 3: Write minimal implementation (append to `src/lib/agent.ts`)**

```typescript
const tomlString = (value: string): string => JSON.stringify(String(value ?? ''));

const tomlMultiline = (value: string): string => {
  const escaped = String(value ?? '').replace(/"""/g, '\\"\\"\\"');
  return `"""${escaped}"""`;
};

export const toToml = (data: AgentFrontmatter, body: string): string => {
  const model = data.model || 'sonnet';
  return [
    `name = ${tomlString(data.name)}`,
    `description = ${tomlString(data.description)}`,
    `model = ${tomlString(model)}`,
    '',
    `developer_instructions = ${tomlMultiline(body)}`,
    '',
  ].join('\n');
};

export const toJson = (data: AgentFrontmatter, body: string): string => {
  const obj: Record<string, unknown> = {
    name: data.name,
    description: data.description,
    model: data.model || 'sonnet',
    prompt: body,
  };
  if (data.tools) {
    const tools = data.tools.split(',').map((t) => t.trim()).filter(Boolean);
    if (tools.length > 0) {
      obj.tools = tools;
    }
  }
  return JSON.stringify(obj, null, 2) + '\n';
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/lib/agent.test.ts`
Expected: PASS (6 + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent.ts __tests__/lib/agent.test.ts
git commit -m "feat(agent): add toToml and toJson converters"
```

---

### Task 8: Agent file enumeration helper

**Files:**
- Modify: `src/lib/agent.ts` (add `listAgentFiles`)
- Test: `__tests__/lib/agent.test.ts` (append)

- [ ] **Step 1: Write the failing test**

```typescript
// append to __tests__/lib/agent.test.ts
import { listAgentFiles } from '../../src/lib/agent';
import { mkdtempSync, rmSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

describe('listAgentFiles', () => {
  test('returns depth-2 .md files sorted, excluding README.md', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-agentls-'));
    try {
      await mkdir(path.join(root, 'global'));
      await mkdir(path.join(root, 'coding'));
      await writeFile(path.join(root, 'README.md'), 'top', 'utf8');
      await writeFile(path.join(root, 'global', 'jira.md'), 'a', 'utf8');
      await writeFile(path.join(root, 'global', 'README.md'), 'skip', 'utf8');
      await writeFile(path.join(root, 'coding', 'frontend.md'), 'b', 'utf8');
      await writeFile(path.join(root, 'coding', 'notes.txt'), 'skip', 'utf8');

      const files = await listAgentFiles(root);
      expect(files).toEqual([
        path.join(root, 'coding', 'frontend.md'),
        path.join(root, 'global', 'jira.md'),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('returns empty array when the agents directory is absent', async () => {
    await expect(listAgentFiles('/no/such/dir')).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/lib/agent.test.ts`
Expected: FAIL — `listAgentFiles` is not exported.

- [ ] **Step 3: Write minimal implementation (append to `src/lib/agent.ts`)**

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';

export const listAgentFiles = async (agentsDir: string): Promise<string[]> => {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(agentsDir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const sub = path.join(agentsDir, entry.name);
    for (const file of await fs.readdir(sub)) {
      if (file.endsWith('.md') && file !== 'README.md') {
        out.push(path.join(sub, file));
      }
    }
  }

  return out.sort();
};
```

Note: move the two `import` lines to the top of `src/lib/agent.ts` (TypeScript requires imports at module top).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/lib/agent.test.ts`
Expected: PASS (10 + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent.ts __tests__/lib/agent.test.ts
git commit -m "feat(agent): add listAgentFiles enumeration helper"
```

---

### Task 9: `runAgentSync` — integrate agents into sync

**Files:**
- Create: `src/commands/sync-agents.ts`
- Modify: `src/commands/sync.ts` (call `runAgentSync` from the `sync` action)
- Test: `__tests__/commands/sync-agents.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/commands/sync-agents.test.ts
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { mkdir, readFile, writeFile, lstat, readlink } from 'fs/promises';
import os from 'os';
import path from 'path';

const loadModules = () => {
  jest.resetModules();
  return {
    config: require('../../src/lib/config') as typeof import('../../src/lib/config'),
    syncAgents: require('../../src/commands/sync-agents') as typeof import('../../src/commands/sync-agents'),
  };
};

const AGENT = `---
name: jira
description: "Jira agent"
model: sonnet
tools: "Skill, Read"
---

Jira agent body.
`;

describe('runAgentSync', () => {
  let home: string;
  let workspace: string;
  let homedirSpy: jest.SpiedFunction<typeof os.homedir>;

  beforeEach(async () => {
    home = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-agenthome-'));
    workspace = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-agentws-'));
    homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(home);
    await mkdir(path.join(workspace, 'agents', 'global'), { recursive: true });
    await writeFile(path.join(workspace, 'agents', 'global', 'jira.md'), AGENT, 'utf8');
  });

  afterEach(() => {
    homedirSpy.mockRestore();
    rmSync(home, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  });

  const writeConfig = async () => {
    const { config } = loadModules();
    await config.writeConfig({
      source: workspace,
      tools: {
        'claude-code': { enabled: true, configPath: path.join(home, '.claude'), mappings: [], agents: { path: path.join(home, '.claude/agents'), format: 'md' } },
        codex: { enabled: true, configPath: path.join(home, '.codex'), mappings: [], agents: { path: path.join(home, '.codex/agents'), format: 'toml' } },
        kiro: { enabled: true, configPath: path.join(home, '.kiro'), mappings: [], agents: { path: path.join(home, '.kiro/agents'), format: 'json' } },
      },
    });
  };

  test('symlinks .md for claude-code (passthrough)', async () => {
    await writeConfig();
    const { syncAgents } = loadModules();
    await syncAgents.runAgentSync();
    const link = path.join(home, '.claude/agents', 'jira.md');
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readlink(link)).toBe(path.join(workspace, 'agents', 'global', 'jira.md'));
  });

  test('writes .toml for codex', async () => {
    await writeConfig();
    const { syncAgents } = loadModules();
    await syncAgents.runAgentSync();
    const out = await readFile(path.join(home, '.codex/agents', 'jira.toml'), 'utf8');
    expect(out).toContain('name = "jira"');
    expect(out).toContain('developer_instructions = """Jira agent body.\n"""');
  });

  test('writes .json for kiro', async () => {
    await writeConfig();
    const { syncAgents } = loadModules();
    await syncAgents.runAgentSync();
    const parsed = JSON.parse(await readFile(path.join(home, '.kiro/agents', 'jira.json'), 'utf8'));
    expect(parsed.name).toBe('jira');
    expect(parsed.tools).toEqual(['Skill', 'Read']);
  });

  test('backs up a pre-existing real .toml before overwriting', async () => {
    await writeConfig();
    const codexDir = path.join(home, '.codex/agents');
    await mkdir(codexDir, { recursive: true });
    await writeFile(path.join(codexDir, 'jira.toml'), 'OLD CONTENT', 'utf8');
    const { syncAgents } = loadModules();
    const results = await syncAgents.runAgentSync();
    const codexResult = results.find((r) => r.tool === 'codex' && r.agent === 'jira');
    expect(codexResult?.action).toBe('backed-up');
    expect(await readFile(path.join(codexDir, 'jira.toml'), 'utf8')).toContain('name = "jira"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/commands/sync-agents.test.ts`
Expected: FAIL — `Cannot find module '../../src/commands/sync-agents'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/commands/sync-agents.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { readConfig, expandHome, AgentFormat } from '../lib/config';
import { checkSymlinkState, createSymlink, removeSymlink } from '../lib/symlink';
import { backupPath } from '../lib/backup';
import { readManifest } from '../lib/workspace';
import { listAgentFiles, parseAgentFile, toToml, toJson } from '../lib/agent';

export interface AgentSyncResult {
  tool: string;
  agent: string;
  format: AgentFormat;
  action: 'linked' | 'skipped' | 'written' | 'backed-up' | 're-linked';
}

const renderAgent = (format: AgentFormat, data: ReturnType<typeof parseAgentFile>['data'], body: string): string =>
  format === 'toml' ? toToml(data, body) : toJson(data, body);

export const runAgentSync = async (): Promise<AgentSyncResult[]> => {
  const config = await readConfig();
  if (!config.source) {
    throw new Error('No source configured. Run `spells setup` first.');
  }

  const root = expandHome(config.source);
  const manifest = await readManifest(root);
  const agentsDir = path.join(root, manifest.agents);
  const files = await listAgentFiles(agentsDir);
  const results: AgentSyncResult[] = [];

  for (const [toolKey, toolConfig] of Object.entries(config.tools)) {
    if (!toolConfig.enabled || !toolConfig.agents) {
      continue;
    }

    const targetDir = expandHome(toolConfig.agents.path);
    const format = toolConfig.agents.format;
    await fs.mkdir(targetDir, { recursive: true });

    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      const { data, body } = parseAgentFile(content);
      const target = path.join(targetDir, `${data.name}.${format}`);

      if (format === 'md') {
        const state = await checkSymlinkState(target, file);
        switch (state) {
          case 'linked':
            results.push({ tool: toolKey, agent: data.name, format, action: 'skipped' });
            break;
          case 'missing':
            await createSymlink(file, target);
            results.push({ tool: toolKey, agent: data.name, format, action: 'linked' });
            break;
          case 'real-dir':
            await backupPath(target);
            await fs.rm(target, { recursive: true, force: true });
            await createSymlink(file, target);
            results.push({ tool: toolKey, agent: data.name, format, action: 'backed-up' });
            break;
          case 'broken':
          case 'wrong-target':
            await removeSymlink(target);
            await createSymlink(file, target);
            results.push({ tool: toolKey, agent: data.name, format, action: 're-linked' });
            break;
        }
      } else {
        const rendered = renderAgent(format, data, body);
        let action: AgentSyncResult['action'] = 'written';
        try {
          const stats = await fs.lstat(target);
          await backupPath(target);
          if (stats.isDirectory()) {
            await fs.rm(target, { recursive: true, force: true });
          }
          action = 'backed-up';
        } catch {
          action = 'written';
        }
        await fs.writeFile(target, rendered, 'utf8');
        results.push({ tool: toolKey, agent: data.name, format, action });
      }
    }
  }

  return results;
};
```

In `src/commands/sync.ts`, import the agents pass at the top:

```typescript
import { runAgentSync } from './sync-agents';
```

Replace the `.action(...)` body of the `sync` command in `registerSync` with:

```typescript
    .action(async () => {
      const results = await runSync();
      for (const r of results) {
        const icon = r.action === 'skipped' ? '=' : '+';
        console.log(`  ${icon} [${r.tool}] ${r.from} → ${r.to}: ${r.action}`);
      }
      const changed = results.filter((r) => r.action !== 'skipped').length;
      console.log(`\nSkills: ${changed} updated, ${results.length - changed} unchanged.`);

      const agentResults = await runAgentSync();
      for (const r of agentResults) {
        const icon = r.action === 'skipped' ? '=' : '+';
        console.log(`  ${icon} [${r.tool}] agent ${r.agent}.${r.format}: ${r.action}`);
      }
      const agentsChanged = agentResults.filter((r) => r.action !== 'skipped').length;
      console.log(`Agents: ${agentsChanged} updated, ${agentResults.length - agentsChanged} unchanged.`);
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/commands/sync-agents.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full suite and build**

Run: `npm test && npm run build`
Expected: all tests PASS; `tsc` compiles with no errors. If `tsc` reports an unused import in `workspace.ts` (`WorkspaceManifest`), remove it.

- [ ] **Step 6: Commit**

```bash
git add src/commands/sync-agents.ts src/commands/sync.ts __tests__/commands/sync-agents.test.ts
git commit -m "feat(sync): add agents pass with md passthrough and toml/json converters"
```

---

## Phase 4 — Legacy Cleanup (iCloud data repo)

### Task 10: Remove confirmed-deprecated legacy artifacts

This task runs in the **iCloud data repo**, not the CLI repo. It is a one-time mechanical deletion (no TDD). The user authorized removing these in the design phase. The retained `scripts/*.sh` are intentionally left untouched.

**Target repo:** `${SYNCSPELLS_PATH:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/sync-spells}`

- [ ] **Step 1: Confirm the three deletion targets still match the spec**

```bash
SS="${SYNCSPELLS_PATH:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/sync-spells}"
ls -d "$SS/sync-spells.json" "$SS/legacy-commands" "$SS"/skills-registry-backup-* 2>/dev/null
```
Expected: the three paths print. If `skills-registry-backup-*` is already gone, skip it below.

- [ ] **Step 2: Verify nothing references them (safety re-check)**

```bash
SS="${SYNCSPELLS_PATH:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/sync-spells}"
find "$HOME/.claude" "$HOME/.codex" "$HOME/.agents" -maxdepth 3 -type l 2>/dev/null \
  | while read -r l; do t=$(readlink "$l"); case "$t" in *legacy-commands*|*sync-spells.json*|*skills-registry-backup*) echo "STILL REFERENCED: $l -> $t";; esac; done
```
Expected: no `STILL REFERENCED` lines. If any appear, STOP and report — do not delete.

- [ ] **Step 3: Remove via git in the iCloud repo**

```bash
SS="${SYNCSPELLS_PATH:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/sync-spells}"
git -C "$SS" rm -r --quiet sync-spells.json legacy-commands
git -C "$SS" rm -r --quiet skills-registry-backup-2026-05-31T09-45-11 2>/dev/null || rm -rf "$SS"/skills-registry-backup-*
```

- [ ] **Step 4: Verify removal**

```bash
SS="${SYNCSPELLS_PATH:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/sync-spells}"
ls -d "$SS/sync-spells.json" "$SS/legacy-commands" "$SS"/skills-registry-backup-* 2>/dev/null || echo "all removed"
```
Expected: `all removed`.

- [ ] **Step 5: Commit in the iCloud repo**

```bash
SS="${SYNCSPELLS_PATH:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/sync-spells}"
git -C "$SS" add -A
git -C "$SS" commit -m "chore: remove deprecated sync-spells.json, legacy-commands/, migration backup"
```

---

## Self-Review

**Spec coverage:**
- §2 workspace.json manifest → Task 1.
- §3 workspace init/doctor/migrate + broken-symlink detection → Tasks 3, 4, 5 (Task 4 asserts broken-symlink detection).
- §4 agents adapter (canonical source, converter map, sync integration, flat-global distribution) → Tasks 6–9.
- §4 Codex `toToml` (name/description/model/developer_instructions) → Task 7.
- §4 Kiro `toJson` (name/description/tools/prompt/model) → Task 7.
- §4 md passthrough + backup-before-replace → Task 9.
- §5 type/config (`AgentTarget`, `ToolConfig.agents`, guard, default wiring) → Task 2.
- §6 legacy cleanup (delete confirmed-dead; retain scripts) → Task 10.

**Deferred per spec (no task, intentional):** scripts retirement, per-preset agent resolution, bidirectional sync, deep Kiro `hooks`/`allowedTools` mapping, frontmatter normalization.

**Type consistency:** `AgentFrontmatter` (Task 6) is consumed unchanged by `toToml`/`toJson` (Task 7) and `runAgentSync` (Task 9). `AgentTarget.format` is the `AgentFormat` union (`'md' | 'toml' | 'json'`, Task 2), used identically in `AgentSyncResult.format` and the `runAgentSync` branch (Task 9). `readManifest(root)` (Task 1) is called with the workspace root in Tasks 4, 5, 9. `WorkspaceManifest.agents` is the agents subdir name, joined onto root in Task 9.

**Note on `agents` tool key collision:** the existing `defaultConfig.tools.agents` entry (mapping `~/.agents`) is Codex's *skills* path and has no `agents` target, so it is correctly skipped by `runAgentSync`'s `!toolConfig.agents` guard. Do not confuse it with the agents *spell type*.
