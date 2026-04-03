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
}

export const configDir = (): string => path.join(os.homedir(), '.sync-spells');

export const CONFIG_PATH = path.join(configDir(), 'config.json');

export const defaultConfig: Config = {
  source: '',
  tools: {
    'claude-code': {
      enabled: false,
      configPath: '~/.claude',
      mappings: [
        { from: 'commands', to: 'commands' },
        { from: 'skills', to: 'skills' },
        { from: 'agents', to: 'agents' },
      ],
    },
    cursor: {
      enabled: false,
      configPath: '~/.cursor',
      mappings: [{ from: 'commands', to: 'commands' }],
    },
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
    return JSON.parse(raw) as Config;
  } catch {
    return JSON.parse(JSON.stringify(defaultConfig)) as Config;
  }
};

export const writeConfig = async (config: Config): Promise<void> => {
  const configPath = getConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
};
