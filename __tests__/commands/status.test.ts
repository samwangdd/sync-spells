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
