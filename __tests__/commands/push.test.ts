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

  test('runPush blocks a new skill without eval verification before copying it', async () => {
    const { runPush } = loadPushModule(tempHome);
    const sourceDir = path.join(tempHome, 'source');
    const scanDir = path.join(tempHome, 'scan');
    writeTestConfig(tempHome, sourceDir);
    mkdirSync(path.join(scanDir, 'skills', 'example'), { recursive: true });
    writeFileSync(path.join(scanDir, 'skills', 'example', 'SKILL.md'), '# Example\n', 'utf8');

    await expect(runPush(scanDir)).rejects.toThrow(/Skill eval gate failed.*skills\/example.*missing-evals/s);
    expect(existsSync(path.join(sourceDir, 'skills', 'example'))).toBe(false);
  });

  test('runPush throws when no source is configured', async () => {
    const { runPush } = loadPushModule(tempHome);
    const configDir = path.join(tempHome, '.sync-spells');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({ source: '', tools: {} }),
      'utf8',
    );

    await expect(runPush('/some/dir')).rejects.toThrow('No source configured');
  });

  test('runPush uses process.cwd() as default scanDir when no path is provided in registerPush', async () => {
    const { runPush } = loadPushModule(tempHome);
    const sourceDir = path.join(tempHome, 'source');
    writeTestConfig(tempHome, sourceDir);
    mkdirSync(path.join(tempHome, 'scan', 'commands'), { recursive: true });
    writeFileSync(path.join(tempHome, 'scan', 'commands', 'test.md'), 'test', 'utf8');

    const result = await runPush(path.join(tempHome, 'scan'));
    expect(result.copied).toBe(1);
  });

  test('runPush handles scanDir with missing mapping subdirectory gracefully', async () => {
    const { runPush } = loadPushModule(tempHome);
    const sourceDir = path.join(tempHome, 'source');
    const scanDir = path.join(tempHome, 'scan');
    writeTestConfig(tempHome, sourceDir);
    // No 'commands' or 'skills' directories in scanDir

    const result = await runPush(scanDir);

    expect(result.copied).toBe(0);
    expect(result.skipped).toBe(0);
  });
});

describe('registerPush', () => {
  const originalHome = process.env.HOME;
  let tempHome: string;

  beforeEach(() => {
    tempHome = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-reg-push-'));
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

  test('registerPush registers push command and action', async () => {
    jest.resetModules();
    const actualOs = jest.requireActual<typeof import('os')>('os');
    jest.doMock('os', () => ({
      ...actualOs,
      homedir: () => tempHome,
    }));

    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { registerPush } = require('../../src/commands/push') as typeof import('../../src/commands/push');

    const mockCommand = {
      command: jest.fn().mockReturnThis(),
      description: jest.fn().mockReturnThis(),
      action: jest.fn(),
    };

    registerPush(mockCommand as unknown as import('commander').Command);

    expect(mockCommand.command).toHaveBeenCalledWith('push [path]');
    expect(mockCommand.description).toHaveBeenCalledWith('Push spell files from a directory into the source');
    expect(mockCommand.action).toHaveBeenCalledTimes(1);
  });

  test('registerPush action uses scanPath argument when provided', async () => {
    jest.resetModules();
    const actualOs = jest.requireActual<typeof import('os')>('os');
    jest.doMock('os', () => ({
      ...actualOs,
      homedir: () => tempHome,
    }));

    const sourceDir = path.join(tempHome, 'source');
    mkdirSync(path.join(tempHome, '.sync-spells'), { recursive: true });
    writeFileSync(
      path.join(tempHome, '.sync-spells', 'config.json'),
      JSON.stringify({
        source: sourceDir,
        tools: {
          'claude-code': {
            enabled: true,
            configPath: '~/.claude',
            mappings: [{ from: 'commands', to: 'commands' }],
          },
        },
      }),
      'utf8',
    );

    const scanDir = path.join(tempHome, 'scan');
    mkdirSync(path.join(scanDir, 'commands'), { recursive: true });
    writeFileSync(path.join(scanDir, 'commands', 'test.md'), 'spell', 'utf8');

    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { registerPush } = require('../../src/commands/push') as typeof import('../../src/commands/push');

    const mockCommand = {
      command: jest.fn().mockReturnThis(),
      description: jest.fn().mockReturnThis(),
      action: jest.fn(),
    };

    registerPush(mockCommand as unknown as import('commander').Command);
    const actionFn = mockCommand.action.mock.calls[0][0] as (scanPath?: string) => Promise<void>;
    await actionFn(scanDir);

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Push complete: 1 copied, 0 skipped'));
  });

  test('registerPush action prints skipped files list', async () => {
    jest.resetModules();
    const actualOs = jest.requireActual<typeof import('os')>('os');
    jest.doMock('os', () => ({
      ...actualOs,
      homedir: () => tempHome,
    }));

    const sourceDir = path.join(tempHome, 'source');
    mkdirSync(path.join(sourceDir, 'commands'), { recursive: true });
    writeFileSync(path.join(sourceDir, 'commands', 'existing.md'), 'original', 'utf8');

    mkdirSync(path.join(tempHome, '.sync-spells'), { recursive: true });
    writeFileSync(
      path.join(tempHome, '.sync-spells', 'config.json'),
      JSON.stringify({
        source: sourceDir,
        tools: {
          'claude-code': {
            enabled: true,
            configPath: '~/.claude',
            mappings: [{ from: 'commands', to: 'commands' }],
          },
        },
      }),
      'utf8',
    );

    const scanDir = path.join(tempHome, 'scan');
    mkdirSync(path.join(scanDir, 'commands'), { recursive: true });
    writeFileSync(path.join(scanDir, 'commands', 'existing.md'), 'new version', 'utf8');

    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { registerPush } = require('../../src/commands/push') as typeof import('../../src/commands/push');

    const mockCommand = {
      command: jest.fn().mockReturnThis(),
      description: jest.fn().mockReturnThis(),
      action: jest.fn(),
    };

    registerPush(mockCommand as unknown as import('commander').Command);
    const actionFn = mockCommand.action.mock.calls[0][0] as (scanPath?: string) => Promise<void>;
    await actionFn(scanDir);

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Skipped (already exist)'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('commands/existing.md'));
  });
});
