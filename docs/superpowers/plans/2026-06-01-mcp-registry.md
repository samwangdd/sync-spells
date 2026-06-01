# MCP Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe MCP registry management for global and project-scoped Claude Code, Cursor, and Codex configuration.

**Architecture:** Add MCP as a capability parallel to skills: source files live in `<source>/mcp-registry`, command handling lives in `src/commands/mcp.ts`, and merge/render logic lives in focused MCP services. Global writes use a manifest at `~/.sync-spells/mcp-manifest.json` so sync-spells updates only owned MCP entries and preserves user-owned target config.

**Tech Stack:** TypeScript, Node `fs/promises`, Commander, Jest, JSON parsing/stringifying, small TOML read/write helpers implemented locally for Codex MCP tables.

---

## File Structure

- Create `src/types/mcp.ts`: MCP source config, normalized server, manifest, operation result, and target tool types.
- Create `src/services/McpRegistryService.ts`: load and validate `mcp-registry/global.json` and `mcp-registry/presets/<preset>.json`.
- Create `src/services/McpManifestService.ts`: read/write `~/.sync-spells/mcp-manifest.json` and answer ownership questions.
- Create `src/services/McpTargetService.ts`: merge JSON targets for Claude Code/Cursor, merge Codex TOML target files, detect conflicts, and render dry-run results.
- Create `src/commands/mcp.ts`: register `spells mcp status`, `spells mcp sync --global`, and `spells mcp use [preset]`.
- Modify `src/index.ts`: register the MCP command.
- Modify `src/types/index.ts`: add `activeMcpPreset` to the project state shape only if a shared state type is introduced during implementation; otherwise leave this file untouched.
- Test with `__tests__/services/McpRegistryService.test.ts`, `__tests__/services/McpManifestService.test.ts`, `__tests__/services/McpTargetService.test.ts`, and `__tests__/commands/mcp.test.ts`.

## Assumptions

- The first implementation supports `command`, `args`, `env`, `url`, and `headers`.
- Source MCP files use JSON with a top-level `mcpServers` object.
- Cursor and Claude Code project targets use the same JSON shape.
- Codex targets use TOML tables named `[mcp_servers.<serverName>]`.
- `--force-adopt` is implemented for global sync only; project sync may use the same ownership rules but does not need a separate persistent manifest in the first pass.
- Git commit steps are included for the implementing worker, but this current sandbox may be unable to write `.git`.

---

### Task 1: MCP Registry Loading and Validation

**Files:**
- Create: `src/types/mcp.ts`
- Create: `src/services/McpRegistryService.ts`
- Test: `__tests__/services/McpRegistryService.test.ts`

- [ ] **Step 1: Write failing tests for registry loading**

Create `__tests__/services/McpRegistryService.test.ts`:

```ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { McpRegistryService } from '../../src/services/McpRegistryService';

describe('McpRegistryService', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = `/tmp/test-mcp-registry-${Date.now()}`;
    await fs.mkdir(path.join(testDir, 'mcp-registry', 'presets'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('loads global and preset servers with preset overriding global by name', async () => {
    await fs.writeFile(
      path.join(testDir, 'mcp-registry', 'global.json'),
      JSON.stringify({
        mcpServers: {
          context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
          docs: { url: 'https://example.com/mcp' }
        }
      })
    );
    await fs.writeFile(
      path.join(testDir, 'mcp-registry', 'presets', 'coding.json'),
      JSON.stringify({
        mcpServers: {
          docs: { command: 'node', args: ['scripts/docs-mcp.js'] }
        }
      })
    );

    const result = await new McpRegistryService(testDir).loadForPreset('coding');

    expect(result.servers.context7).toEqual({ command: 'npx', args: ['-y', '@upstash/context7-mcp'] });
    expect(result.servers.docs).toEqual({ command: 'node', args: ['scripts/docs-mcp.js'] });
    expect(result.sources).toEqual([
      path.join(testDir, 'mcp-registry', 'global.json'),
      path.join(testDir, 'mcp-registry', 'presets', 'coding.json')
    ]);
  });

  it('returns an empty config when registry files are missing', async () => {
    const result = await new McpRegistryService(testDir).loadForPreset('coding');

    expect(result.servers).toEqual({});
    expect(result.sources).toEqual([]);
  });

  it('rejects invalid server shapes with the server name in the error', async () => {
    await fs.writeFile(
      path.join(testDir, 'mcp-registry', 'global.json'),
      JSON.stringify({ mcpServers: { broken: { args: 'not-array' } } })
    );

    await expect(new McpRegistryService(testDir).loadGlobal()).rejects.toThrow('broken');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx jest __tests__/services/McpRegistryService.test.ts --runInBand
```

Expected: FAIL because `McpRegistryService` and `src/types/mcp.ts` do not exist.

- [ ] **Step 3: Add MCP types**

Create `src/types/mcp.ts`:

```ts
export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface McpSourceConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export interface LoadedMcpConfig {
  servers: Record<string, McpServerConfig>;
  sources: string[];
}

export type McpToolKey = 'claude-code' | 'cursor' | 'codex';
export type McpScope = 'global' | 'project';

export interface McpManifest {
  targets: Record<string, string[]>;
}

export type McpChangeAction = 'add' | 'update' | 'remove' | 'skip' | 'conflict';

export interface McpChange {
  tool: McpToolKey;
  scope: McpScope;
  server: string;
  action: McpChangeAction;
  targetPath: string;
  message?: string;
}
```

- [ ] **Step 4: Implement registry service**

Create `src/services/McpRegistryService.ts`:

```ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { LoadedMcpConfig, McpServerConfig, McpSourceConfig } from '../types/mcp';

const isStringRecord = (value: unknown): value is Record<string, string> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === 'string');
};

const validateServer = (name: string, value: unknown): McpServerConfig => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid MCP server "${name}": expected object`);
  }

  const server = value as Partial<McpServerConfig>;
  if (server.command !== undefined && typeof server.command !== 'string') {
    throw new Error(`Invalid MCP server "${name}": command must be a string`);
  }
  if (server.args !== undefined && (!Array.isArray(server.args) || !server.args.every((arg) => typeof arg === 'string'))) {
    throw new Error(`Invalid MCP server "${name}": args must be a string array`);
  }
  if (server.env !== undefined && !isStringRecord(server.env)) {
    throw new Error(`Invalid MCP server "${name}": env must be a string map`);
  }
  if (server.url !== undefined && typeof server.url !== 'string') {
    throw new Error(`Invalid MCP server "${name}": url must be a string`);
  }
  if (server.headers !== undefined && !isStringRecord(server.headers)) {
    throw new Error(`Invalid MCP server "${name}": headers must be a string map`);
  }
  if (!server.command && !server.url) {
    throw new Error(`Invalid MCP server "${name}": command or url is required`);
  }

  return {
    ...(server.command !== undefined ? { command: server.command } : {}),
    ...(server.args !== undefined ? { args: server.args } : {}),
    ...(server.env !== undefined ? { env: server.env } : {}),
    ...(server.url !== undefined ? { url: server.url } : {}),
    ...(server.headers !== undefined ? { headers: server.headers } : {})
  };
};

const parseSourceConfig = (filePath: string, raw: string): McpSourceConfig => {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid MCP registry file ${filePath}: expected object`);
  }

  const maybeConfig = parsed as Partial<McpSourceConfig>;
  if (typeof maybeConfig.mcpServers !== 'object' || maybeConfig.mcpServers === null || Array.isArray(maybeConfig.mcpServers)) {
    throw new Error(`Invalid MCP registry file ${filePath}: mcpServers must be an object`);
  }

  const mcpServers: Record<string, McpServerConfig> = {};
  for (const [name, value] of Object.entries(maybeConfig.mcpServers)) {
    mcpServers[name] = validateServer(name, value);
  }
  return { mcpServers };
};

export class McpRegistryService {
  constructor(private sourceDir: string) {}

  async loadGlobal(): Promise<LoadedMcpConfig> {
    return this.loadFiles([path.join(this.sourceDir, 'mcp-registry', 'global.json')]);
  }

  async loadForPreset(preset: string): Promise<LoadedMcpConfig> {
    return this.loadFiles([
      path.join(this.sourceDir, 'mcp-registry', 'global.json'),
      path.join(this.sourceDir, 'mcp-registry', 'presets', `${preset}.json`)
    ]);
  }

  private async loadFiles(files: string[]): Promise<LoadedMcpConfig> {
    const servers: Record<string, McpServerConfig> = {};
    const sources: string[] = [];

    for (const file of files) {
      let raw: string;
      try {
        raw = await fs.readFile(file, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          continue;
        }
        throw error;
      }

      const parsed = parseSourceConfig(file, raw);
      Object.assign(servers, parsed.mcpServers);
      sources.push(file);
    }

    return { servers, sources };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npx jest __tests__/services/McpRegistryService.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/mcp.ts src/services/McpRegistryService.ts __tests__/services/McpRegistryService.test.ts
git commit -m "feat: add MCP registry loader"
```

---

### Task 2: Manifest Ownership Service

**Files:**
- Create: `src/services/McpManifestService.ts`
- Test: `__tests__/services/McpManifestService.test.ts`

- [ ] **Step 1: Write failing manifest tests**

Create `__tests__/services/McpManifestService.test.ts`:

```ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { McpManifestService } from '../../src/services/McpManifestService';

describe('McpManifestService', () => {
  let testDir: string;
  let manifestPath: string;

  beforeEach(async () => {
    testDir = `/tmp/test-mcp-manifest-${Date.now()}`;
    manifestPath = path.join(testDir, 'mcp-manifest.json');
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('returns an empty manifest when missing', async () => {
    const service = new McpManifestService(manifestPath);

    await expect(service.read()).resolves.toEqual({ targets: {} });
  });

  it('tracks owned entries by target key', async () => {
    const service = new McpManifestService(manifestPath);
    await service.write({ targets: { 'codex:global': ['context7'] } });

    expect(await service.owns('codex:global', 'context7')).toBe(true);
    expect(await service.owns('codex:global', 'manual')).toBe(false);
  });

  it('updates a target entry list deterministically', async () => {
    const service = new McpManifestService(manifestPath);
    await service.write({ targets: { 'codex:global': ['old'], 'cursor:global': ['manual'] } });
    await service.setOwnedEntries('codex:global', ['zeta', 'alpha']);

    const manifest = await service.read();
    expect(manifest.targets).toEqual({
      'codex:global': ['alpha', 'zeta'],
      'cursor:global': ['manual']
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx jest __tests__/services/McpManifestService.test.ts --runInBand
```

Expected: FAIL because `McpManifestService` does not exist.

- [ ] **Step 3: Implement manifest service**

Create `src/services/McpManifestService.ts`:

```ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { McpManifest } from '../types/mcp';

const emptyManifest = (): McpManifest => ({ targets: {} });

export class McpManifestService {
  constructor(private manifestPath: string) {}

  async read(): Promise<McpManifest> {
    try {
      const raw = await fs.readFile(this.manifestPath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return emptyManifest();
      }

      const manifest = parsed as Partial<McpManifest>;
      if (typeof manifest.targets !== 'object' || manifest.targets === null || Array.isArray(manifest.targets)) {
        return emptyManifest();
      }

      const targets: Record<string, string[]> = {};
      for (const [target, entries] of Object.entries(manifest.targets)) {
        if (Array.isArray(entries) && entries.every((entry) => typeof entry === 'string')) {
          targets[target] = [...entries].sort();
        }
      }
      return { targets };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return emptyManifest();
      }
      throw error;
    }
  }

  async write(manifest: McpManifest): Promise<void> {
    await fs.mkdir(path.dirname(this.manifestPath), { recursive: true });
    await fs.writeFile(this.manifestPath, JSON.stringify({ targets: manifest.targets }, null, 2), 'utf8');
  }

  async owns(targetKey: string, serverName: string): Promise<boolean> {
    const manifest = await this.read();
    return (manifest.targets[targetKey] || []).includes(serverName);
  }

  async setOwnedEntries(targetKey: string, entries: string[]): Promise<void> {
    const manifest = await this.read();
    manifest.targets[targetKey] = [...entries].sort();
    await this.write(manifest);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx jest __tests__/services/McpManifestService.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/McpManifestService.ts __tests__/services/McpManifestService.test.ts
git commit -m "feat: track managed MCP entries"
```

---

### Task 3: Target Merge and Codex TOML Rendering

**Files:**
- Create: `src/services/McpTargetService.ts`
- Test: `__tests__/services/McpTargetService.test.ts`

- [ ] **Step 1: Write failing target merge tests**

Create `__tests__/services/McpTargetService.test.ts`:

```ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { McpTargetService } from '../../src/services/McpTargetService';
import { McpManifestService } from '../../src/services/McpManifestService';

describe('McpTargetService', () => {
  let testDir: string;
  let manifest: McpManifestService;

  beforeEach(async () => {
    testDir = `/tmp/test-mcp-target-${Date.now()}`;
    await fs.mkdir(testDir, { recursive: true });
    manifest = new McpManifestService(path.join(testDir, 'manifest.json'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('merges owned JSON entries and preserves unmanaged entries', async () => {
    const targetPath = path.join(testDir, '.cursor', 'mcp.json');
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, JSON.stringify({
      mcpServers: {
        manual: { command: 'node', args: ['manual.js'] },
        context7: { command: 'old' }
      }
    }, null, 2));
    await manifest.write({ targets: { 'cursor:global': ['context7'] } });

    const changes = await new McpTargetService(manifest).writeJsonTarget({
      tool: 'cursor',
      scope: 'global',
      targetPath,
      servers: { context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] } },
      dryRun: false,
      forceAdopt: false
    });

    expect(changes.map((change) => change.action)).toEqual(['update']);
    const written = JSON.parse(await fs.readFile(targetPath, 'utf8'));
    expect(written.mcpServers.manual).toEqual({ command: 'node', args: ['manual.js'] });
    expect(written.mcpServers.context7).toEqual({ command: 'npx', args: ['-y', '@upstash/context7-mcp'] });
  });

  it('reports conflicts for unmanaged JSON entries', async () => {
    const targetPath = path.join(testDir, '.mcp.json');
    await fs.writeFile(targetPath, JSON.stringify({ mcpServers: { context7: { command: 'manual' } } }));

    const changes = await new McpTargetService(manifest).writeJsonTarget({
      tool: 'claude-code',
      scope: 'project',
      targetPath,
      servers: { context7: { command: 'npx' } },
      dryRun: false,
      forceAdopt: false
    });

    expect(changes).toEqual([
      expect.objectContaining({ action: 'conflict', server: 'context7' })
    ]);
    const written = JSON.parse(await fs.readFile(targetPath, 'utf8'));
    expect(written.mcpServers.context7).toEqual({ command: 'manual' });
  });

  it('writes Codex TOML MCP tables and preserves unrelated settings', async () => {
    const targetPath = path.join(testDir, 'config.toml');
    await fs.writeFile(targetPath, 'model = "gpt-5"\\n\\n[mcp_servers.manual]\\ncommand = "node"\\nargs = ["manual.js"]\\n');

    const changes = await new McpTargetService(manifest).writeCodexTarget({
      tool: 'codex',
      scope: 'global',
      targetPath,
      servers: { context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] } },
      dryRun: false,
      forceAdopt: false
    });

    expect(changes).toEqual([
      expect.objectContaining({ action: 'add', server: 'context7' })
    ]);
    const written = await fs.readFile(targetPath, 'utf8');
    expect(written).toContain('model = "gpt-5"');
    expect(written).toContain('[mcp_servers.manual]');
    expect(written).toContain('[mcp_servers.context7]');
    expect(written).toContain('command = "npx"');
    expect(written).toContain('args = ["-y", "@upstash/context7-mcp"]');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx jest __tests__/services/McpTargetService.test.ts --runInBand
```

Expected: FAIL because `McpTargetService` does not exist.

- [ ] **Step 3: Implement target service**

Create `src/services/McpTargetService.ts`:

```ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { McpChange, McpScope, McpServerConfig, McpToolKey } from '../types/mcp';
import { McpManifestService } from './McpManifestService';

interface WriteTargetOptions {
  tool: McpToolKey;
  scope: McpScope;
  targetPath: string;
  servers: Record<string, McpServerConfig>;
  dryRun: boolean;
  forceAdopt: boolean;
}

const targetKey = (tool: McpToolKey, scope: McpScope): string => `${tool}:${scope}`;

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const readTextIfExists = async (filePath: string): Promise<string> => {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    throw error;
  }
};

const stringifyTomlValue = (value: string | string[] | Record<string, string>): string => {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => JSON.stringify(entry)).join(', ')}]`;
  }
  const pairs = Object.entries(value).map(([key, entry]) => `${JSON.stringify(key)} = ${JSON.stringify(entry)}`);
  return `{ ${pairs.join(', ')} }`;
};

const renderCodexServer = (name: string, server: McpServerConfig): string => {
  const lines = [`[mcp_servers.${name}]`];
  if (server.command !== undefined) lines.push(`command = ${stringifyTomlValue(server.command)}`);
  if (server.args !== undefined) lines.push(`args = ${stringifyTomlValue(server.args)}`);
  if (server.env !== undefined) lines.push(`env = ${stringifyTomlValue(server.env)}`);
  if (server.url !== undefined) lines.push(`url = ${stringifyTomlValue(server.url)}`);
  if (server.headers !== undefined) lines.push(`headers = ${stringifyTomlValue(server.headers)}`);
  return lines.join('\n');
};

const removeCodexServerBlock = (content: string, name: string): string => {
  const lines = content.split('\n');
  const output: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const table = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (table) {
      skipping = table[1] === `mcp_servers.${name}`;
    }
    if (!skipping) {
      output.push(line);
    }
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
};

const codexHasServer = (content: string, name: string): boolean => {
  return new RegExp(`^\\s*\\[mcp_servers\\.${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\s*$`, 'm').test(content);
};

export class McpTargetService {
  constructor(private manifest: McpManifestService) {}

  async writeJsonTarget(options: WriteTargetOptions): Promise<McpChange[]> {
    const key = targetKey(options.tool, options.scope);
    const raw = await readTextIfExists(options.targetPath);
    const parsed = raw ? JSON.parse(raw) : {};
    const root = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    const existingServers = typeof root.mcpServers === 'object' && root.mcpServers !== null && !Array.isArray(root.mcpServers)
      ? root.mcpServers as Record<string, unknown>
      : {};
    const nextServers = { ...existingServers };
    const changes: McpChange[] = [];
    const owned = (await this.manifest.read()).targets[key] || [];

    for (const [name, server] of Object.entries(options.servers)) {
      const exists = Object.prototype.hasOwnProperty.call(existingServers, name);
      const isOwned = owned.includes(name);
      if (exists && !isOwned && !options.forceAdopt) {
        changes.push({ tool: options.tool, scope: options.scope, server: name, action: 'conflict', targetPath: options.targetPath });
        continue;
      }

      const action = exists ? (sameJson(existingServers[name], server) ? 'skip' : 'update') : 'add';
      changes.push({ tool: options.tool, scope: options.scope, server: name, action, targetPath: options.targetPath });
      nextServers[name] = server;
    }

    if (!options.dryRun && !changes.some((change) => change.action === 'conflict')) {
      root.mcpServers = nextServers;
      await fs.mkdir(path.dirname(options.targetPath), { recursive: true });
      await fs.writeFile(options.targetPath, `${JSON.stringify(root, null, 2)}\n`, 'utf8');
      await this.manifest.setOwnedEntries(key, Object.keys(options.servers));
    }

    return changes;
  }

  async writeCodexTarget(options: WriteTargetOptions): Promise<McpChange[]> {
    const key = targetKey(options.tool, options.scope);
    let content = await readTextIfExists(options.targetPath);
    const owned = (await this.manifest.read()).targets[key] || [];
    const changes: McpChange[] = [];

    for (const [name, server] of Object.entries(options.servers)) {
      const exists = codexHasServer(content, name);
      const isOwned = owned.includes(name);
      if (exists && !isOwned && !options.forceAdopt) {
        changes.push({ tool: options.tool, scope: options.scope, server: name, action: 'conflict', targetPath: options.targetPath });
        continue;
      }

      changes.push({ tool: options.tool, scope: options.scope, server: name, action: exists ? 'update' : 'add', targetPath: options.targetPath });
      content = removeCodexServerBlock(content, name);
      content = `${content.trimEnd()}\n\n${renderCodexServer(name, server)}\n`;
    }

    if (!options.dryRun && !changes.some((change) => change.action === 'conflict')) {
      await fs.mkdir(path.dirname(options.targetPath), { recursive: true });
      await fs.writeFile(options.targetPath, content.trimStart(), 'utf8');
      await this.manifest.setOwnedEntries(key, Object.keys(options.servers));
    }

    return changes;
  }
}
```

- [ ] **Step 4: Run target tests**

Run:

```bash
npx jest __tests__/services/McpTargetService.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Run all MCP service tests**

Run:

```bash
npx jest __tests__/services/McpRegistryService.test.ts __tests__/services/McpManifestService.test.ts __tests__/services/McpTargetService.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/McpTargetService.ts __tests__/services/McpTargetService.test.ts
git commit -m "feat: merge MCP target configs"
```

---

### Task 4: MCP Command Surface

**Files:**
- Create: `src/commands/mcp.ts`
- Modify: `src/index.ts`
- Test: `__tests__/commands/mcp.test.ts`

- [ ] **Step 1: Write failing command tests**

Create `__tests__/commands/mcp.test.ts`:

```ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Config } from '../../src/lib/config';
import { runMcpGlobalSync, runMcpStatus, runMcpUse } from '../../src/commands/mcp';

describe('mcp command', () => {
  let testDir: string;
  let projectDir: string;
  let config: Config;

  beforeEach(async () => {
    testDir = `/tmp/test-mcp-command-${Date.now()}`;
    projectDir = path.join(testDir, 'project');
    await fs.mkdir(path.join(testDir, 'source', 'mcp-registry', 'presets'), { recursive: true });
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'source', 'mcp-registry', 'global.json'),
      JSON.stringify({ mcpServers: { context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] } } })
    );
    await fs.writeFile(
      path.join(testDir, 'source', 'mcp-registry', 'presets', 'coding.json'),
      JSON.stringify({ mcpServers: { local: { command: 'node', args: ['server.js'] } } })
    );

    config = {
      source: path.join(testDir, 'source'),
      tools: {
        'claude-code': { enabled: true, configPath: path.join(testDir, 'claude'), mappings: [] },
        cursor: { enabled: true, configPath: path.join(testDir, 'cursor'), mappings: [] },
        codex: { enabled: true, configPath: path.join(testDir, 'codex'), mappings: [] },
        agents: { enabled: false, configPath: path.join(testDir, 'agents'), mappings: [] }
      },
      projectBindings: [{ path: testDir, profile: 'coding' }]
    };
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('dry-runs global sync without writing target files', async () => {
    const result = await runMcpGlobalSync(config, { dryRun: true, forceAdopt: false, manifestPath: path.join(testDir, 'manifest.json') });

    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ tool: 'claude-code', scope: 'global', server: 'context7', action: 'add' }),
      expect.objectContaining({ tool: 'cursor', scope: 'global', server: 'context7', action: 'add' }),
      expect.objectContaining({ tool: 'codex', scope: 'global', server: 'context7', action: 'add' })
    ]));
    await expect(fs.access(path.join(testDir, 'cursor', 'mcp.json'))).rejects.toBeTruthy();
  });

  it('writes project MCP targets for an explicit preset', async () => {
    const result = await runMcpUse(config, projectDir, 'coding', { dryRun: false, forceAdopt: false, manifestPath: path.join(testDir, 'manifest.json') });

    expect(result.preset).toBe('coding');
    expect(result.changes.some((change) => change.targetPath.endsWith('.mcp.json'))).toBe(true);
    expect(JSON.parse(await fs.readFile(path.join(projectDir, '.mcp.json'), 'utf8')).mcpServers.local).toEqual({ command: 'node', args: ['server.js'] });
    expect(await fs.readFile(path.join(projectDir, '.codex', 'config.toml'), 'utf8')).toContain('[mcp_servers.local]');

    const state = JSON.parse(await fs.readFile(path.join(projectDir, '.sync-spells.json'), 'utf8'));
    expect(state.activeMcpPreset).toBe('coding');
  });

  it('reports status with inferred preset and registry availability', async () => {
    const status = await runMcpStatus(config, projectDir);

    expect(status.inferredPreset).toBe('coding');
    expect(status.registry.global).toBe(true);
    expect(status.registry.presets).toContain('coding');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx jest __tests__/commands/mcp.test.ts --runInBand
```

Expected: FAIL because `src/commands/mcp.ts` does not exist.

- [ ] **Step 3: Implement MCP command helpers and registration**

Create `src/commands/mcp.ts`:

```ts
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Command } from 'commander';
import { Config, configDir, expandHome, readConfig } from '../lib/config';
import { McpChange, McpToolKey } from '../types/mcp';
import { McpManifestService } from '../services/McpManifestService';
import { McpRegistryService } from '../services/McpRegistryService';
import { McpTargetService } from '../services/McpTargetService';
import { ProjectService } from '../services/ProjectService';
import { ProfileService } from '../services/ProfileService';

interface McpRunOptions {
  dryRun: boolean;
  forceAdopt: boolean;
  manifestPath?: string;
}

interface McpRunResult {
  preset?: string;
  changes: McpChange[];
}

const enabledMcpTools = (config: Config): McpToolKey[] => {
  return (['claude-code', 'cursor', 'codex'] as McpToolKey[]).filter((tool) => config.tools[tool]?.enabled);
};

const manifestPathFor = (options: McpRunOptions): string => options.manifestPath || path.join(configDir(), 'mcp-manifest.json');

const globalTargetPath = (config: Config, tool: McpToolKey): string => {
  const configured = expandHome(config.tools[tool].configPath);
  if (tool === 'claude-code') return path.join(os.homedir(), '.claude.json');
  if (tool === 'cursor') return path.join(configured, 'mcp.json');
  return path.join(configured, 'config.toml');
};

const projectTargetPath = (projectPath: string, tool: McpToolKey): string => {
  if (tool === 'claude-code') return path.join(projectPath, '.mcp.json');
  if (tool === 'cursor') return path.join(projectPath, '.cursor', 'mcp.json');
  return path.join(projectPath, '.codex', 'config.toml');
};

const writeTargets = async (
  config: Config,
  scope: 'global' | 'project',
  basePath: string,
  servers: McpRunResult['changes'] extends never ? never : Record<string, import('../types/mcp').McpServerConfig>,
  options: McpRunOptions
): Promise<McpChange[]> => {
  const manifest = new McpManifestService(manifestPathFor(options));
  const targetService = new McpTargetService(manifest);
  const changes: McpChange[] = [];

  for (const tool of enabledMcpTools(config)) {
    const targetPath = scope === 'global' ? globalTargetPath(config, tool) : projectTargetPath(basePath, tool);
    const next = tool === 'codex'
      ? await targetService.writeCodexTarget({ tool, scope, targetPath, servers, dryRun: options.dryRun, forceAdopt: options.forceAdopt })
      : await targetService.writeJsonTarget({ tool, scope, targetPath, servers, dryRun: options.dryRun, forceAdopt: options.forceAdopt });
    changes.push(...next);
  }

  return changes;
};

export const runMcpGlobalSync = async (config: Config, options: McpRunOptions): Promise<McpRunResult> => {
  if (!config.source) {
    throw new Error('No source configured. Run `spells setup` first.');
  }
  const loaded = await new McpRegistryService(expandHome(config.source)).loadGlobal();
  const changes = await writeTargets(config, 'global', '', loaded.servers, options);
  return { changes };
};

export const runMcpUse = async (
  config: Config,
  projectPath: string,
  preset: string | undefined,
  options: McpRunOptions
): Promise<McpRunResult> => {
  if (!config.source) {
    throw new Error('No source configured. Run `spells setup` first.');
  }

  const profileSvc = new ProfileService(config);
  const projectSvc = new ProjectService(config, profileSvc);
  const finalPreset = preset || projectSvc.inferProfile(projectPath) || 'global-lite';
  const loaded = await new McpRegistryService(expandHome(config.source)).loadForPreset(finalPreset);
  const changes = await writeTargets(config, 'project', projectPath, loaded.servers, options);

  if (!options.dryRun && !changes.some((change) => change.action === 'conflict')) {
    let state: Record<string, unknown> = {};
    try {
      state = JSON.parse(await fs.readFile(path.join(projectPath, '.sync-spells.json'), 'utf8'));
    } catch {}
    state.activeMcpPreset = finalPreset;
    await fs.writeFile(path.join(projectPath, '.sync-spells.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }

  return { preset: finalPreset, changes };
};

export const runMcpStatus = async (config: Config, projectPath: string) => {
  const source = expandHome(config.source || '');
  const registryDir = path.join(source, 'mcp-registry');
  const profileSvc = new ProfileService(config);
  const projectSvc = new ProjectService(config, profileSvc);
  let presets: string[] = [];

  try {
    presets = (await fs.readdir(path.join(registryDir, 'presets')))
      .filter((name) => name.endsWith('.json'))
      .map((name) => path.basename(name, '.json'))
      .sort();
  } catch {}

  let activeMcpPreset: string | null = null;
  try {
    const state = JSON.parse(await fs.readFile(path.join(projectPath, '.sync-spells.json'), 'utf8'));
    activeMcpPreset = typeof state.activeMcpPreset === 'string' ? state.activeMcpPreset : null;
  } catch {}

  return {
    activeMcpPreset,
    inferredPreset: projectSvc.inferProfile(projectPath),
    registry: {
      global: await fs.access(path.join(registryDir, 'global.json')).then(() => true).catch(() => false),
      presets
    },
    enabledTools: enabledMcpTools(config)
  };
};

const printChanges = (changes: McpChange[]): void => {
  for (const change of changes) {
    console.log(`  ${change.action} [${change.tool}:${change.scope}] ${change.server} -> ${change.targetPath}`);
  }
};

export const registerMcp = (program: Command): void => {
  const mcp = program.command('mcp').description('Manage MCP server configuration');

  mcp
    .command('status')
    .description('Show MCP registry and project status')
    .action(async () => {
      const status = await runMcpStatus(await readConfig(), process.cwd());
      console.log(`Active MCP preset: ${status.activeMcpPreset || '-'}`);
      console.log(`Inferred preset: ${status.inferredPreset || '-'}`);
      console.log(`Global registry: ${status.registry.global ? 'yes' : 'no'}`);
      console.log(`Preset registries: ${status.registry.presets.join(', ') || '-'}`);
      console.log(`Enabled tools: ${status.enabledTools.join(', ') || '-'}`);
    });

  mcp
    .command('sync')
    .option('--global', 'sync global MCP config')
    .option('--dry-run', 'show changes without writing')
    .option('--force-adopt', 'adopt conflicting existing entries')
    .description('Sync MCP server config')
    .action(async (options: { global?: boolean; dryRun?: boolean; forceAdopt?: boolean }) => {
      if (!options.global) {
        throw new Error('Only `spells mcp sync --global` is supported.');
      }
      const result = await runMcpGlobalSync(await readConfig(), {
        dryRun: Boolean(options.dryRun),
        forceAdopt: Boolean(options.forceAdopt)
      });
      printChanges(result.changes);
    });

  mcp
    .command('use [preset]')
    .option('--dry-run', 'show changes without writing')
    .option('--force-adopt', 'adopt conflicting existing entries')
    .description('Activate project MCP config')
    .action(async (preset: string | undefined, options: { dryRun?: boolean; forceAdopt?: boolean }) => {
      const result = await runMcpUse(await readConfig(), process.cwd(), preset, {
        dryRun: Boolean(options.dryRun),
        forceAdopt: Boolean(options.forceAdopt)
      });
      console.log(`MCP preset: ${result.preset}`);
      printChanges(result.changes);
    });
};
```

- [ ] **Step 4: Register command in CLI**

Modify `src/index.ts`:

```ts
import { registerMcp } from './commands/mcp';
```

Add after `registerBind(program);`:

```ts
registerMcp(program);
```

- [ ] **Step 5: Run command tests**

Run:

```bash
npx jest __tests__/commands/mcp.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Run TypeScript build**

Run:

```bash
npm run build
```

Expected: PASS. If TypeScript rejects the dynamic import type in `writeTargets`, replace the parameter type with a direct imported `McpServerConfig`.

- [ ] **Step 7: Commit**

```bash
git add src/commands/mcp.ts src/index.ts __tests__/commands/mcp.test.ts
git commit -m "feat: add MCP command surface"
```

---

### Task 5: Documentation and Full Verification

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/02_Application/SyncSpells/skill-distribution-model.md`

- [ ] **Step 1: Update README English MCP section**

Add this section to `README.md` after the skill management command list:

```md
## MCP Management

MCP configuration is managed separately from skills. Put shared MCP servers in `mcp-registry/global.json` and project presets in `mcp-registry/presets/<preset>.json`.

```bash
spells mcp status
spells mcp sync --global --dry-run
spells mcp sync --global
spells mcp use coding --dry-run
spells mcp use coding
```

Global MCP sync merges only sync-spells-owned server entries into Claude Code, Cursor, and Codex target files. Existing user-owned settings are preserved and same-name conflicts are refused unless explicitly adopted.
```

- [ ] **Step 2: Update Chinese README MCP section**

Add this section to `README.zh-CN.md` after the skill management command list:

```md
## MCP 管理

MCP 配置和 skills 分开管理。共享 MCP 放在 `mcp-registry/global.json`，项目 preset 放在 `mcp-registry/presets/<preset>.json`。

```bash
spells mcp status
spells mcp sync --global --dry-run
spells mcp sync --global
spells mcp use coding --dry-run
spells mcp use coding
```

全局 MCP 同步只合并 sync-spells 托管的 server 条目到 Claude Code、Cursor 和 Codex 的目标配置文件。已有的用户配置会保留；同名但未托管的条目默认视为冲突，不会覆盖。
```

- [ ] **Step 3: Update distribution model doc**

Append this section to `docs/02_Application/SyncSpells/skill-distribution-model.md`:

```md
## MCP Distribution

MCP distribution follows the same global/project split but uses `mcp-registry/`, not `skills-registry/`.

```text
Tool-global MCP:
  spells mcp sync --global -> mcp-registry/global.json -> tool global config, merge-owned entries only

Repo-local MCP:
  spells mcp use [preset] -> mcp-registry/global.json + mcp-registry/presets/<preset>.json -> repo MCP target files
```

Global MCP writes are merge operations. sync-spells records owned target entries in `~/.sync-spells/mcp-manifest.json` and preserves entries outside that manifest.

Worktrees inherit preset selection through longest path bindings, but MCP target files are generated into each worktree root.
```

- [ ] **Step 4: Run focused MCP tests**

Run:

```bash
npx jest __tests__/services/McpRegistryService.test.ts __tests__/services/McpManifestService.test.ts __tests__/services/McpTargetService.test.ts __tests__/commands/mcp.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Run full test suite**

Run:

```bash
npm test -- --runInBand
```

Expected: PASS.

- [ ] **Step 6: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add README.md README.zh-CN.md docs/02_Application/SyncSpells/skill-distribution-model.md
git commit -m "docs: document MCP registry workflow"
```

---

## Self-Review

- Spec coverage: The plan covers `mcp-registry/` layout, manifest ownership, global merge, project activation, worktree inheritance through bindings, command surface, conflict handling, and tests.
- Placeholder scan: No `TBD` or empty implementation tasks remain. Each implementation step includes exact paths and code.
- Type consistency: `McpServerConfig`, `McpManifest`, `McpChange`, `McpToolKey`, and `McpScope` are defined in Task 1 and reused by later tasks.
- Scope check: This plan implements MCP config management only. It does not add MCP server installation or secret management, matching the non-goals.
