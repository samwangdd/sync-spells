import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
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

    const target = await fs.readlink(path.join(toolDir, 'commands'));
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

    const target = await fs.readlink(path.join(toolDir, 'commands'));
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
    await expect(fs.lstat(path.join(toolDir, 'skills'))).rejects.toThrow();
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

  test('runSync warns but continues when the changed-skill eval gate fails', async () => {
    jest.doMock('../../src/lib/skillEvals', () => ({
      ...jest.requireActual<typeof import('../../src/lib/skillEvals')>('../../src/lib/skillEvals'),
      collectGitChangedPaths: jest.fn(async () => ['coding/example/SKILL.md']),
      auditSkillRegistry: jest.fn(async () => ({
        passed: false,
        issues: [{
          skill: 'coding/example',
          code: 'missing-evals',
          level: 'error',
          message: 'evals/evals.json is required',
        }],
      })),
    }));
    const { runSync } = loadSyncModule(tempHome);
    const sourceDir = path.join(tempHome, 'source');
    const toolDir = path.join(tempHome, 'tool');
    mkdirSync(path.join(sourceDir, 'coding', 'example'), { recursive: true });
    writeFileSync(path.join(sourceDir, 'coding', 'example', 'SKILL.md'), '# Example\n');
    writeTestConfig(tempHome, sourceDir, {
      codex: {
        enabled: true,
        configPath: toolDir,
        mappings: [{ from: 'coding', to: 'skills' }],
      },
    });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const results = await runSync();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('coding/example: missing-evals'));
    expect(results.some((r) => r.tool === 'codex' && r.action === 'linked')).toBe(true);
    warnSpy.mockRestore();
    jest.dontMock('../../src/lib/skillEvals');
  });

  test('runSync throws when no source is configured', async () => {
    const { runSync } = loadSyncModule(tempHome);
    const configDir = path.join(tempHome, '.sync-spells');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({ source: '', tools: {} }),
      'utf8',
    );

    await expect(runSync()).rejects.toThrow('No source configured');
  });

  test('runBoundProjectSync refreshes every configured project binding with its own profile', async () => {
    const { runBoundProjectSync } = loadSyncModule(tempHome);
    const sourceDir = path.join(tempHome, 'source');
    const profilesDir = path.join(sourceDir, 'profiles');
    const projectA = path.join(tempHome, 'project-a');
    const projectB = path.join(tempHome, 'project-b');

    mkdirSync(path.join(sourceDir, 'coding', 'web-perf'), { recursive: true });
    mkdirSync(path.join(sourceDir, 'knowledge', 'notes'), { recursive: true });
    mkdirSync(profilesDir, { recursive: true });
    mkdirSync(projectA, { recursive: true });
    mkdirSync(projectB, { recursive: true });
    writeFileSync(path.join(sourceDir, 'coding', 'web-perf', 'SKILL.md'), '# Web Perf', 'utf8');
    writeFileSync(path.join(sourceDir, 'knowledge', 'notes', 'SKILL.md'), '# Notes', 'utf8');
    writeFileSync(path.join(profilesDir, 'coding.json'), JSON.stringify({ name: 'coding', extras: ['coding/web-perf'] }), 'utf8');
    writeFileSync(path.join(profilesDir, 'knowledge.json'), JSON.stringify({ name: 'knowledge', extras: ['knowledge/notes'] }), 'utf8');

    writeTestConfig(tempHome, sourceDir, {
      codex: {
        enabled: true,
        configPath: path.join(tempHome, '.codex'),
        mappings: [{ from: 'global', to: 'skills' }],
      },
    });
    const configPath = path.join(tempHome, '.sync-spells', 'config.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    config.profilesDir = profilesDir;
    config.projectBindings = [
      { path: projectA, profile: 'coding' },
      { path: projectB, profile: 'knowledge' },
    ];
    writeFileSync(configPath, JSON.stringify(config), 'utf8');

    const results = await runBoundProjectSync();

    expect(results.map((result) => ({ projectPath: result.projectPath, profile: result.profile }))).toEqual([
      { projectPath: projectA, profile: 'coding' },
      { projectPath: projectB, profile: 'knowledge' },
    ]);
    expect(await fs.readlink(path.join(projectA, '.codex', 'skills', 'web-perf'))).toBe(
      path.join(sourceDir, 'coding', 'web-perf'),
    );
    expect(await fs.readlink(path.join(projectB, '.codex', 'skills', 'notes'))).toBe(
      path.join(sourceDir, 'knowledge', 'notes'),
    );
  });
});

describe('registerSync', () => {
  const originalHome = process.env.HOME;
  let tempHome: string;

  beforeEach(() => {
    tempHome = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-reg-sync-'));
    process.env.HOME = tempHome;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    jest.restoreAllMocks();
    jest.resetModules();
    if (tempHome) {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test('registerSync registers sync command and action', () => {
    jest.resetModules();
    const actualOs = jest.requireActual<typeof import('os')>('os');
    jest.doMock('os', () => ({
      ...actualOs,
      homedir: () => tempHome,
    }));

    const { registerSync } = require('../../src/commands/sync') as typeof import('../../src/commands/sync');

    const mockCommand = {
      command: jest.fn().mockReturnThis(),
      description: jest.fn().mockReturnThis(),
      action: jest.fn(),
    };

    registerSync(mockCommand as unknown as import('commander').Command);

    expect(mockCommand.command).toHaveBeenCalledWith('sync');
    expect(mockCommand.description).toHaveBeenCalledWith('Sync spells from source to all enabled tools');
    expect(mockCommand.action).toHaveBeenCalledTimes(1);
  });

  test('registerSync action prints sync results with icons', async () => {
    jest.resetModules();
    const actualOs = jest.requireActual<typeof import('os')>('os');
    jest.doMock('os', () => ({
      ...actualOs,
      homedir: () => tempHome,
    }));

    const sourceDir = path.join(tempHome, 'source');
    const toolDir = path.join(tempHome, 'tool');
    mkdirSync(path.join(sourceDir, 'commands'), { recursive: true });
    writeFileSync(path.join(sourceDir, 'commands', 'test.md'), 'spell', 'utf8');

    mkdirSync(path.join(tempHome, '.sync-spells'), { recursive: true });
    writeFileSync(
      path.join(tempHome, '.sync-spells', 'config.json'),
      JSON.stringify({
        source: sourceDir,
        tools: {
          'claude-code': {
            enabled: true,
            configPath: toolDir,
            mappings: [{ from: 'commands', to: 'commands' }],
          },
        },
      }),
      'utf8',
    );

    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { registerSync } = require('../../src/commands/sync') as typeof import('../../src/commands/sync');

    const mockCommand = {
      command: jest.fn().mockReturnThis(),
      description: jest.fn().mockReturnThis(),
      action: jest.fn(),
    };

    registerSync(mockCommand as unknown as import('commander').Command);
    const actionFn = mockCommand.action.mock.calls[0][0] as () => Promise<void>;
    await actionFn();

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('+ [claude-code]'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('linked'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Skills: 1 updated'));
  });

  test('registerSync action shows unchanged count for already-linked items', async () => {
    jest.resetModules();
    const actualOs = jest.requireActual<typeof import('os')>('os');
    jest.doMock('os', () => ({
      ...actualOs,
      homedir: () => tempHome,
    }));

    const sourceDir = path.join(tempHome, 'source');
    const toolDir = path.join(tempHome, 'tool');
    mkdirSync(path.join(sourceDir, 'commands'), { recursive: true });
    mkdirSync(toolDir, { recursive: true });
    await fs.symlink(path.join(sourceDir, 'commands'), path.join(toolDir, 'commands'));

    mkdirSync(path.join(tempHome, '.sync-spells'), { recursive: true });
    writeFileSync(
      path.join(tempHome, '.sync-spells', 'config.json'),
      JSON.stringify({
        source: sourceDir,
        tools: {
          'claude-code': {
            enabled: true,
            configPath: toolDir,
            mappings: [{ from: 'commands', to: 'commands' }],
          },
        },
      }),
      'utf8',
    );

    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { registerSync } = require('../../src/commands/sync') as typeof import('../../src/commands/sync');

    const mockCommand = {
      command: jest.fn().mockReturnThis(),
      description: jest.fn().mockReturnThis(),
      action: jest.fn(),
    };

    registerSync(mockCommand as unknown as import('commander').Command);
    const actionFn = mockCommand.action.mock.calls[0][0] as () => Promise<void>;
    await actionFn();

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('= [claude-code]'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Skills: 0 updated, 1 unchanged'));
  });
});
