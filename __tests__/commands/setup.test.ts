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
