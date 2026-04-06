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

  test('runSetup with empty tools array creates config with no tools', async () => {
    const { runSetup } = loadSetupModule(tempHome);
    const { getConfigPath } = loadConfigModule(tempHome);
    const sourceDir = path.join(tempHome, 'empty-tools');

    const config = await runSetup(sourceDir, []);

    expect(config.source).toBe(sourceDir);
    expect(config.tools).toEqual({});

    const raw = readFileSync(getConfigPath(), 'utf8');
    expect(JSON.parse(raw).tools).toEqual({});
  });

  test('runSetup ignores invalid tool keys', async () => {
    const { runSetup } = loadSetupModule(tempHome);
    const sourceDir = path.join(tempHome, 'mixed-tools');

    const config = await runSetup(sourceDir, ['claude-code', 'nonexistent-tool']);

    expect(Object.keys(config.tools)).toEqual(['claude-code']);
    expect(config.tools['claude-code'].enabled).toBe(true);
  });
});

describe('registerSetup', () => {
  const originalHome = process.env.HOME;
  let tempHome: string;

  beforeEach(() => {
    tempHome = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-reg-setup-'));
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

  test('registerSetup registers setup command and runs action with prompts', async () => {
    jest.resetModules();
    const actualOs = jest.requireActual<typeof import('os')>('os');
    jest.doMock('os', () => ({
      ...actualOs,
      homedir: () => tempHome,
    }));

    const capturedCalls: { input: unknown[]; checkbox: unknown[] } = { input: [], checkbox: [] };
    jest.doMock('@inquirer/prompts', () => ({
      input: (opts: unknown) => { capturedCalls.input.push(opts); return Promise.resolve('~/my-spells'); },
      checkbox: (opts: unknown) => { capturedCalls.checkbox.push(opts); return Promise.resolve(['claude-code']); },
    }));

    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { registerSetup } = require('../../src/commands/setup') as typeof import('../../src/commands/setup');

    const mockCommand = {
      command: jest.fn().mockReturnThis(),
      description: jest.fn().mockReturnThis(),
      action: jest.fn(),
    };

    registerSetup(mockCommand as unknown as import('commander').Command);

    expect(mockCommand.command).toHaveBeenCalledWith('setup');
    expect(mockCommand.description).toHaveBeenCalledWith('Initialize sync-spells configuration');
    expect(mockCommand.action).toHaveBeenCalledTimes(1);

    // Execute the registered action
    const actionFn = mockCommand.action.mock.calls[0][0] as () => Promise<void>;
    await actionFn();

    expect(capturedCalls.input).toEqual([{
      message: 'Source directory for spells:',
      default: '~/spells',
    }]);
    expect(capturedCalls.checkbox).toEqual([{
      message: 'Select tools to enable:',
      choices: expect.any(Array),
    }]);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Setup complete'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Enabled tools: claude-code'));
  });

  test('registerSetup expands ~/ in source directory', async () => {
    jest.resetModules();
    const actualOs = jest.requireActual<typeof import('os')>('os');
    jest.doMock('os', () => ({
      ...actualOs,
      homedir: () => tempHome,
    }));
    jest.doMock('@inquirer/prompts', () => ({
      input: () => Promise.resolve('~/expanded-spells'),
      checkbox: () => Promise.resolve(['cursor']),
    }));

    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { registerSetup } = require('../../src/commands/setup') as typeof import('../../src/commands/setup');

    const mockCommand = {
      command: jest.fn().mockReturnThis(),
      description: jest.fn().mockReturnThis(),
      action: jest.fn(),
    };

    registerSetup(mockCommand as unknown as import('commander').Command);
    const actionFn = mockCommand.action.mock.calls[0][0] as () => Promise<void>;
    await actionFn();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(path.join(tempHome, 'expanded-spells')),
    );
  });

  test('registerSetup does not expand absolute paths', async () => {
    jest.resetModules();
    const actualOs = jest.requireActual<typeof import('os')>('os');
    jest.doMock('os', () => ({
      ...actualOs,
      homedir: () => tempHome,
    }));
    const absPath = path.join(tempHome, 'absolute-spells');
    jest.doMock('@inquirer/prompts', () => ({
      input: () => Promise.resolve(absPath),
      checkbox: () => Promise.resolve(['codex']),
    }));

    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { registerSetup } = require('../../src/commands/setup') as typeof import('../../src/commands/setup');

    const mockCommand = {
      command: jest.fn().mockReturnThis(),
      description: jest.fn().mockReturnThis(),
      action: jest.fn(),
    };

    registerSetup(mockCommand as unknown as import('commander').Command);
    const actionFn = mockCommand.action.mock.calls[0][0] as () => Promise<void>;
    await actionFn();

    // An absolute path (not starting with ~/) should be used as-is
    // The source path in the config should match the original absPath exactly
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('absolute-spells'));
  });
});
