import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

export interface ToolMapping {
  from: string;
  to: string;
}

export interface ToolConfig {
  enabled: boolean;
  configPath: string;
  mappings: ToolMapping[];
}

export interface Config {
  source: string;
  tools: Record<string, ToolConfig>;
  defaultProfile?: string;
  profilesDir?: string;
}

const isToolMapping = (value: unknown): value is ToolMapping => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const mapping = value as Partial<ToolMapping>;
  return typeof mapping.from === 'string' && typeof mapping.to === 'string';
};

const isToolConfig = (value: unknown): value is ToolConfig => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const config = value as Partial<ToolConfig>;
  return (
    typeof config.enabled === 'boolean' &&
    typeof config.configPath === 'string' &&
    Array.isArray(config.mappings) &&
    config.mappings.every(isToolMapping)
  );
};

const isConfig = (value: unknown): value is Config => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const config = value as Partial<Config>;
  if (
    typeof config.source !== 'string' ||
    typeof config.tools !== 'object' ||
    config.tools === null ||
    Array.isArray(config.tools)
  ) {
    return false;
  }

  return Object.values(config.tools).every(isToolConfig);
};

export const configDir = (): string => path.join(os.homedir(), '.sync-spells');

export const CONFIG_PATH = path.join(configDir(), 'config.json');

export const defaultConfig: Config = {
  source: '',
  tools: {
    'claude-code': { enabled: true, configPath: '~/.claude', mappings: [{ from: 'global', to: 'skills' }] },
    'agents':      { enabled: true, configPath: '~/.agents', mappings: [{ from: 'global', to: 'skills' }] },
    'codex':       { enabled: true, configPath: '~/.codex',  mappings: [{ from: 'global', to: 'skills' }] },
    'cursor':      { enabled: true, configPath: '~/.cursor', mappings: [{ from: 'global', to: 'skills' }] },
  },
};

export const getConfigPath = (): string =>
  path.join(os.homedir(), '.sync-spells', 'config.json');

export const expandHome = (filePath: string): string => {
  if (!filePath.startsWith('~/')) {
    return filePath;
  }

  return path.join(os.homedir(), filePath.slice(2));
};

export const readConfig = async (): Promise<Config> => {
  try {
    const raw = await fs.readFile(getConfigPath(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return isConfig(parsed) ? parsed : JSON.parse(JSON.stringify(defaultConfig));
  } catch {
    return JSON.parse(JSON.stringify(defaultConfig)) as Config;
  }
};

export const writeConfig = async (config: Config): Promise<void> => {
  const configPath = getConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
};
