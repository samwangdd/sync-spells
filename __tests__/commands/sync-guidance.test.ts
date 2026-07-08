import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { lstat, mkdir, readFile, readlink, readdir, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

const loadGuidanceModule = (homeDir: string) => {
  jest.resetModules();
  const actualOs = jest.requireActual<typeof import('os')>('os');
  jest.doMock('os', () => ({
    ...actualOs,
    homedir: () => homeDir,
  }));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/commands/sync-guidance') as typeof import('../../src/commands/sync-guidance');
};

describe('global guidance sync', () => {
  let home: string;
  let workspace: string;
  let sourceRoot: string;

  const makeConfig = () => ({
    source: sourceRoot,
    tools: {
      codex: {
        enabled: true,
        configPath: path.join(home, '.codex'),
        mappings: [],
      },
      'claude-code': {
        enabled: true,
        configPath: path.join(home, '.claude'),
        mappings: [],
      },
      kiro: {
        enabled: true,
        configPath: path.join(home, '.kiro'),
        mappings: [],
      },
    },
  });

  beforeEach(async () => {
    home = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-guidance-'));
    workspace = path.join(home, 'oh-my-sync-spells');
    sourceRoot = path.join(workspace, 'skill-category');
    await mkdir(sourceRoot, { recursive: true });
    await writeFile(path.join(workspace, 'AGENTS.md'), '# Global AGENTS\n', 'utf8');
  });

  afterEach(() => {
    jest.dontMock('os');
    rmSync(home, { recursive: true, force: true });
  });

  test('links Codex and Claude to canonical AGENTS and writes a Kiro wrapper', async () => {
    const { runGuidanceSync, runGuidanceStatus } = loadGuidanceModule(home);
    const canonical = path.join(workspace, 'AGENTS.md');

    const results = await runGuidanceSync(makeConfig());

    expect(results.map((r) => [r.tool, r.action])).toEqual([
      ['codex', 'linked'],
      ['claude-code', 'linked'],
      ['kiro', 'written'],
    ]);
    expect((await lstat(path.join(home, '.codex', 'AGENTS.md'))).isSymbolicLink()).toBe(true);
    expect(await readlink(path.join(home, '.codex', 'AGENTS.md'))).toBe(canonical);
    expect(await readlink(path.join(home, '.claude', 'CLAUDE.md'))).toBe(canonical);

    const kiroWrapper = await readFile(path.join(home, '.kiro', 'steering', 'global.md'), 'utf8');
    expect(kiroWrapper).toContain('sync-spells:global-guidance');
    expect(kiroWrapper).toContain(canonical);

    await expect(runGuidanceStatus(makeConfig())).resolves.toEqual([
      expect.objectContaining({ tool: 'codex', state: 'linked' }),
      expect.objectContaining({ tool: 'claude-code', state: 'linked' }),
      expect.objectContaining({ tool: 'kiro', state: 'managed-wrapper' }),
    ]);
  });

  test('is idempotent when targets are already in the desired state', async () => {
    const { runGuidanceSync } = loadGuidanceModule(home);

    await runGuidanceSync(makeConfig());
    const results = await runGuidanceSync(makeConfig());

    expect(results.map((r) => r.action)).toEqual(['skipped', 'skipped', 'skipped']);
  });

  test('backs up real files before replacing them with managed guidance targets', async () => {
    const { runGuidanceSync } = loadGuidanceModule(home);
    await mkdir(path.join(home, '.codex'), { recursive: true });
    await mkdir(path.join(home, '.kiro', 'steering'), { recursive: true });
    await writeFile(path.join(home, '.codex', 'AGENTS.md'), 'local codex guidance', 'utf8');
    await writeFile(path.join(home, '.kiro', 'steering', 'global.md'), 'local kiro guidance', 'utf8');

    const results = await runGuidanceSync(makeConfig());

    expect(results).toEqual([
      expect.objectContaining({ tool: 'codex', action: 'backed-up' }),
      expect.objectContaining({ tool: 'claude-code', action: 'linked' }),
      expect.objectContaining({ tool: 'kiro', action: 'backed-up' }),
    ]);
    expect(await readlink(path.join(home, '.codex', 'AGENTS.md'))).toBe(path.join(workspace, 'AGENTS.md'));

    const backupRuns = await readdir(path.join(home, '.sync-spells', 'backups'));
    expect(backupRuns.length).toBeGreaterThan(0);
  });

  test('reports an error for each enabled target when canonical AGENTS is missing', async () => {
    const { runGuidanceSync } = loadGuidanceModule(home);
    await rmSync(path.join(workspace, 'AGENTS.md'), { force: true });

    const results = await runGuidanceSync(makeConfig());

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.action === 'error')).toBe(true);
    expect(results.every((r) => r.error === 'canonical AGENTS.md not found')).toBe(true);
  });
});
