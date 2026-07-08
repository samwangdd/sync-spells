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

  test('readConfig falls back to defaultConfig when tools is an array', async () => {
    const { defaultConfig, readConfig, getConfigPath } = loadConfigModule();

    const configPath = getConfigPath();
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify(
        {
          source: 'disk',
          tools: [],
        },
        null,
        2,
      ),
      'utf8',
    );

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

  test('expandHome expands ~/ to home directory', () => {
    const { expandHome } = loadConfigModule();
    const result = expandHome('~/documents/spells');
    expect(result).toBe(path.join(tempHome, 'documents/spells'));
  });

  test('expandHome returns unchanged path when it does not start with ~/', () => {
    const { expandHome } = loadConfigModule();
    const absPath = '/absolute/path/spells';
    const result = expandHome(absPath);
    expect(result).toBe(absPath);
  });

  test('configDir returns path under homedir', () => {
    const { configDir } = loadConfigModule();
    expect(configDir()).toBe(path.join(tempHome, '.sync-spells'));
  });

  test('readConfig falls back to defaultConfig for invalid tool mapping', async () => {
    const { defaultConfig, readConfig, getConfigPath } = loadConfigModule();

    const configPath = getConfigPath();
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({
        source: 'test',
        tools: {
          'bad-tool': {
            enabled: true,
            configPath: '~/.bad',
            mappings: [{ from: 123, to: 'commands' }], // from is not a string
          },
        },
      }, null, 2),
      'utf8',
    );

    await expect(readConfig()).resolves.toEqual(defaultConfig);
  });

  test('readConfig falls back to defaultConfig for tool config missing enabled', async () => {
    const { defaultConfig, readConfig, getConfigPath } = loadConfigModule();

    const configPath = getConfigPath();
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({
        source: 'test',
        tools: {
          'incomplete': {
            configPath: '~/.test',
            mappings: [{ from: 'a', to: 'b' }],
            // missing 'enabled' field
          },
        },
      }, null, 2),
      'utf8',
    );

    await expect(readConfig()).resolves.toEqual(defaultConfig);
  });

  test('readConfig falls back to defaultConfig for tools being null', async () => {
    const { defaultConfig, readConfig, getConfigPath } = loadConfigModule();

    const configPath = getConfigPath();
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({ source: 'test', tools: null }, null, 2),
      'utf8',
    );

    await expect(readConfig()).resolves.toEqual(defaultConfig);
  });

  // --- Profile-related field tests ---

  test('readConfig reads config with profile fields from disk', async () => {
    const { readConfig, getConfigPath } = loadConfigModule();
    const configWithProfiles = {
      source: 'disk',
      tools: {
        'claude-code': {
          enabled: true,
          configPath: '~/.claude',
          mappings: [{ from: 'commands', to: 'commands' }],
        },
      },
      defaultProfile: 'work',
      profilesDir: '~/.sync-spells/profiles',
      projectBindings: [{ path: '/Users/sammore/codeLab', profile: 'coding' }],
    };

    const configPath = getConfigPath();
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(configWithProfiles, null, 2), 'utf8');

    await expect(readConfig()).resolves.toEqual(configWithProfiles);
  });

  test('writeConfig writes config with profile fields and it can be read back', async () => {
    const { readConfig, writeConfig } = loadConfigModule();
    const configWithProfiles = {
      source: 'roundtrip-profiles',
      tools: {
        cursor: {
          enabled: true,
          configPath: '~/.cursor',
          mappings: [{ from: 'commands', to: 'commands' }],
        },
      },
      defaultProfile: 'personal',
      profilesDir: '~/.sync-spells/profiles',
      projectBindings: [{ path: '/Users/sammore/codeLab/MEXC', profile: 'mexc-code' }],
    };

    await writeConfig(configWithProfiles);
    await expect(readConfig()).resolves.toEqual(configWithProfiles);
  });

  test('readConfig accepts config without profile fields (backward compatible)', async () => {
    const { readConfig, getConfigPath } = loadConfigModule();
    // Simulate an old config that has no profile fields
    const legacyConfig = {
      source: 'legacy',
      tools: {
        'claude-code': {
          enabled: true,
          configPath: '~/.claude',
          mappings: [{ from: 'commands', to: 'commands' }],
        },
      },
    };

    const configPath = getConfigPath();
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(legacyConfig, null, 2), 'utf8');

    await expect(readConfig()).resolves.toEqual(legacyConfig);
  });

  test('readConfig accepts config with only some profile fields', async () => {
    const { readConfig, getConfigPath } = loadConfigModule();
    const partialConfig = {
      source: 'partial',
      tools: {
        'claude-code': {
          enabled: true,
          configPath: '~/.claude',
          mappings: [{ from: 'commands', to: 'commands' }],
        },
      },
      defaultProfile: 'work',
      // profilesDir is omitted
    };

    const configPath = getConfigPath();
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(partialConfig, null, 2), 'utf8');

    await expect(readConfig()).resolves.toEqual(partialConfig);
  });

  test('defaultConfig has five tools each mapping global to skills', async () => {
    const { defaultConfig } = loadConfigModule();
    expect(Object.keys(defaultConfig.tools).sort()).toEqual(
      ['agents', 'claude-code', 'codex', 'cursor', 'kiro'].sort(),
    );
    for (const key of Object.keys(defaultConfig.tools)) {
      const tool = defaultConfig.tools[key];
      expect(tool.enabled).toBe(true);
      expect(tool.mappings).toEqual([{ from: 'global', to: 'skills' }]);
    }
    expect(defaultConfig.tools['claude-code'].configPath).toBe('~/.claude');
    expect(defaultConfig.tools['agents'].configPath).toBe('~/.agents');
    expect(defaultConfig.tools['codex'].configPath).toBe('~/.codex');
    expect(defaultConfig.tools['cursor'].configPath).toBe('~/.cursor');
    expect(defaultConfig.tools['kiro'].configPath).toBe('~/.kiro');
  });

  test('readConfig accepts a tool with an agents target', async () => {
    const { readConfig, getConfigPath } = loadConfigModule();
    const saved = {
      source: 'disk',
      tools: {
        codex: {
          enabled: true,
          configPath: '~/.codex',
          mappings: [],
          agents: { path: '~/.codex/agents', format: 'toml' },
        },
      },
    };
    const configPath = getConfigPath();
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(saved, null, 2), 'utf8');

    await expect(readConfig()).resolves.toEqual(saved);
  });

  test('readConfig rejects a tool whose agents target has an invalid format', async () => {
    const { readConfig, defaultConfig, getConfigPath } = loadConfigModule();
    const saved = {
      source: 'disk',
      tools: {
        codex: {
          enabled: true,
          configPath: '~/.codex',
          mappings: [],
          agents: { path: '~/.codex/agents', format: 'yaml' },
        },
      },
    };
    const configPath = getConfigPath();
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(saved, null, 2), 'utf8');

    await expect(readConfig()).resolves.toEqual(defaultConfig);
  });

  test('readConfig accepts a tool with syncMode copy', async () => {
    const { readConfig, getConfigPath } = loadConfigModule();
    const saved = {
      source: 'disk',
      tools: {
        kiro: {
          enabled: true,
          configPath: '~/.kiro',
          mappings: [{ from: 'global', to: 'skills' }],
          syncMode: 'copy',
        },
      },
    };
    const configPath = getConfigPath();
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(saved, null, 2), 'utf8');

    await expect(readConfig()).resolves.toEqual(saved);
  });

  test('readConfig rejects a tool with an invalid syncMode', async () => {
    const { readConfig, defaultConfig, getConfigPath } = loadConfigModule();
    const saved = {
      source: 'disk',
      tools: {
        kiro: {
          enabled: true,
          configPath: '~/.kiro',
          mappings: [],
          syncMode: 'hardlink',
        },
      },
    };
    const configPath = getConfigPath();
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(saved, null, 2), 'utf8');

    await expect(readConfig()).resolves.toEqual(defaultConfig);
  });

  test('defaultConfig gives kiro copy mode and the global skills mapping', () => {
    const { defaultConfig } = loadConfigModule();
    expect(defaultConfig.tools.kiro.syncMode).toBe('copy');
    expect(defaultConfig.tools.kiro.mappings).toEqual([{ from: 'global', to: 'skills' }]);
  });

  test('defaultConfig wires agent targets for claude-code, codex, cursor, and kiro', () => {
    const { defaultConfig } = loadConfigModule();
    expect(defaultConfig.tools['claude-code'].agents).toEqual({ path: '~/.claude/agents', format: 'md' });
    expect(defaultConfig.tools.codex.agents).toEqual({ path: '~/.codex/agents', format: 'toml' });
    expect(defaultConfig.tools.cursor.agents).toEqual({ path: '~/.cursor/agents', format: 'md' });
    expect(defaultConfig.tools.kiro.agents).toEqual({ path: '~/.kiro/agents', format: 'json' });
  });
});
