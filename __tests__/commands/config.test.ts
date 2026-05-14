import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { readFile } from 'fs/promises';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';

const loadConfigCommandModule = (homeDir: string) => {
  jest.resetModules();
  const actualOs = jest.requireActual<typeof import('os')>('os');
  jest.doMock('os', () => ({
    ...actualOs,
    homedir: () => homeDir,
  }));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/commands/config') as typeof import('../../src/commands/config');
};

const writeTestConfig = (homeDir: string, config: Record<string, unknown>) => {
  const configDir = path.join(homeDir, '.sync-spells');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    path.join(configDir, 'config.json'),
    JSON.stringify(config),
    'utf8',
  );
};

describe('config command', () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-config-'));
  });

  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true });
  });

  describe('runConfigGet', () => {
    test('should get config value for existing key', async () => {
      writeTestConfig(tempHome, {
        source: '/test/source',
        tools: {},
        defaultProfile: 'test-profile',
      });

      const { runConfigGet } = loadConfigCommandModule(tempHome);
      const result = await runConfigGet('source');
      expect(result.key).toBe('source');
      expect(result.value).toBe('/test/source');
    });

    test('should get nested config value', async () => {
      writeTestConfig(tempHome, {
        source: '/test/source',
        tools: {},
      });

      const { runConfigGet } = loadConfigCommandModule(tempHome);
      const result = await runConfigGet('tools');
      expect(result.key).toBe('tools');
      expect(result.value).toEqual({});
    });

    test('should throw for missing key', async () => {
      writeTestConfig(tempHome, {
        source: '/test/source',
        tools: {},
      });

      const { runConfigGet } = loadConfigCommandModule(tempHome);
      await expect(runConfigGet('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('runConfigSet', () => {
    test('should set config value as string', async () => {
      writeTestConfig(tempHome, {
        source: '/test/source',
        tools: {},
        defaultProfile: 'old-profile',
      });

      const { runConfigSet } = loadConfigCommandModule(tempHome);
      const result = await runConfigSet('defaultProfile', 'new-profile');
      expect(result.key).toBe('defaultProfile');
      expect(result.value).toBe('new-profile');

      // Verify persisted
      const configPath = path.join(tempHome, '.sync-spells', 'config.json');
      const raw = await readFile(configPath, 'utf8');
      const config = JSON.parse(raw);
      expect(config.defaultProfile).toBe('new-profile');
    });

    test('should set config value as boolean true', async () => {
      writeTestConfig(tempHome, {
        source: '/test/source',
        tools: {},
      });

      const { runConfigSet } = loadConfigCommandModule(tempHome);
      const result = await runConfigSet('someFlag', 'true');
      expect(result.value).toBe(true);
    });

    test('should set config value as boolean false', async () => {
      writeTestConfig(tempHome, {
        source: '/test/source',
        tools: {},
      });

      const { runConfigSet } = loadConfigCommandModule(tempHome);
      const result = await runConfigSet('someFlag', 'false');
      expect(result.value).toBe(false);
    });

    test('should set config value as number', async () => {
      writeTestConfig(tempHome, {
        source: '/test/source',
        tools: {},
      });

      const { runConfigSet } = loadConfigCommandModule(tempHome);
      const result = await runConfigSet('count', '42');
      expect(result.value).toBe(42);
    });

    test('should not parse zero as NaN', async () => {
      writeTestConfig(tempHome, {
        source: '/test/source',
        tools: {},
      });

      const { runConfigSet } = loadConfigCommandModule(tempHome);
      const result = await runConfigSet('zeroVal', '0');
      expect(result.value).toBe(0);
    });

    test('should preserve existing config when setting new key', async () => {
      writeTestConfig(tempHome, {
        source: '/test/source',
        tools: {},
        defaultProfile: 'keep-me',
      });

      const { runConfigSet } = loadConfigCommandModule(tempHome);
      await runConfigSet('newKey', 'newValue');

      const configPath = path.join(tempHome, '.sync-spells', 'config.json');
      const raw = await readFile(configPath, 'utf8');
      const config = JSON.parse(raw);
      expect(config.source).toBe('/test/source');
      expect(config.defaultProfile).toBe('keep-me');
      expect(config.newKey).toBe('newValue');
    });
  });
});
