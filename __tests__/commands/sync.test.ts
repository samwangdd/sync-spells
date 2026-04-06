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
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Sync complete: 1 updated'));
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
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Sync complete: 0 updated, 1 unchanged'));
  });
});
