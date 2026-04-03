import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { mkdir, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { mkdtempSync, rmSync } from 'fs';

const loadConfigModule = () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/lib/config') as typeof import('../../src/lib/config');
};

describe('config module', () => {
  const originalHome = process.env.HOME;
  let tempHome: string;
  let homedirSpy: jest.SpiedFunction<typeof os.homedir>;

  beforeEach(() => {
    tempHome = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-home-'));
    process.env.HOME = tempHome;
    homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(tempHome);
  });

  afterEach(() => {
    homedirSpy.mockRestore();
    process.env.HOME = originalHome;
    rmSync(tempHome, { recursive: true, force: true });
  });

  test('readConfig returns defaultConfig when config file does not exist', async () => {
    const { defaultConfig, readConfig } = loadConfigModule();

    await expect(readConfig()).resolves.toEqual(defaultConfig);
  });

  test('readConfig reads saved config from disk', async () => {
    const { readConfig, getConfigPath } = loadConfigModule();
    const savedConfig = {
      source: 'disk',
      tools: {
        cursor: {
          enabled: true,
          configPath: '~/.cursor',
          mappings: [{ from: 'commands', to: 'custom-commands' }],
        },
      },
    };

    const configPath = getConfigPath();
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(savedConfig, null, 2), 'utf8');

    await expect(readConfig()).resolves.toEqual(savedConfig);
  });

  test('readConfig falls back to defaultConfig for malformed parseable JSON', async () => {
    const { defaultConfig, readConfig, getConfigPath } = loadConfigModule();

    const configPath = getConfigPath();
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify({}, null, 2), 'utf8');

    await expect(readConfig()).resolves.toEqual(defaultConfig);
  });

  test('writeConfig writes config to disk and it can be read back', async () => {
    const { readConfig, writeConfig } = loadConfigModule();
    const config = {
      source: 'roundtrip',
      tools: {
        'claude-code': {
          enabled: true,
          configPath: '~/.claude',
          mappings: [
            { from: 'commands', to: 'commands' },
            { from: 'skills', to: 'skills' },
            { from: 'agents', to: 'agents' },
          ],
        },
      },
    };

    await writeConfig(config);

    await expect(readConfig()).resolves.toEqual(config);
  });
});
