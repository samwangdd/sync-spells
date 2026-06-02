import * as fs from 'fs/promises';
import * as path from 'path';
import { LoadedMcpConfig, McpServerConfig, McpSourceConfig } from '../types/mcp';

const isStringRecord = (value: unknown): value is Record<string, string> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === 'string');
};

const validateServer = (name: string, value: unknown): McpServerConfig => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid MCP server "${name}": expected object`);
  }

  const server = value as Partial<McpServerConfig>;

  if (server.command !== undefined && typeof server.command !== 'string') {
    throw new Error(`Invalid MCP server "${name}": command must be a string`);
  }
  if (
    server.args !== undefined &&
    (!Array.isArray(server.args) || !server.args.every((arg) => typeof arg === 'string'))
  ) {
    throw new Error(`Invalid MCP server "${name}": args must be a string array`);
  }
  if (server.env !== undefined && !isStringRecord(server.env)) {
    throw new Error(`Invalid MCP server "${name}": env must be a string map`);
  }
  if (server.url !== undefined && typeof server.url !== 'string') {
    throw new Error(`Invalid MCP server "${name}": url must be a string`);
  }
  if (server.headers !== undefined && !isStringRecord(server.headers)) {
    throw new Error(`Invalid MCP server "${name}": headers must be a string map`);
  }
  if (!server.command && !server.url) {
    throw new Error(`Invalid MCP server "${name}": command or url is required`);
  }

  return {
    ...(server.command !== undefined ? { command: server.command } : {}),
    ...(server.args !== undefined ? { args: server.args } : {}),
    ...(server.env !== undefined ? { env: server.env } : {}),
    ...(server.url !== undefined ? { url: server.url } : {}),
    ...(server.headers !== undefined ? { headers: server.headers } : {})
  };
};

const parseSourceConfig = (filePath: string, raw: string): McpSourceConfig => {
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid MCP registry file ${filePath}: expected object`);
  }

  const maybeConfig = parsed as Partial<McpSourceConfig>;

  if (
    typeof maybeConfig.mcpServers !== 'object' ||
    maybeConfig.mcpServers === null ||
    Array.isArray(maybeConfig.mcpServers)
  ) {
    throw new Error(`Invalid MCP registry file ${filePath}: mcpServers must be an object`);
  }

  const mcpServers: Record<string, McpServerConfig> = {};

  for (const [name, value] of Object.entries(maybeConfig.mcpServers)) {
    mcpServers[name] = validateServer(name, value);
  }

  return { mcpServers };
};

export class McpRegistryService {
  constructor(private sourceDir: string) {}

  async loadGlobal(): Promise<LoadedMcpConfig> {
    return this.loadFiles([path.join(this.sourceDir, 'mcp-registry', 'global.json')]);
  }

  async loadForPreset(preset: string): Promise<LoadedMcpConfig> {
    return this.loadFiles([
      path.join(this.sourceDir, 'mcp-registry', 'global.json'),
      path.join(this.sourceDir, 'mcp-registry', 'presets', `${preset}.json`)
    ]);
  }

  private async loadFiles(files: string[]): Promise<LoadedMcpConfig> {
    const servers: Record<string, McpServerConfig> = {};
    const sources: string[] = [];

    for (const file of files) {
      let raw: string;

      try {
        raw = await fs.readFile(file, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          continue;
        }
        throw error;
      }

      const parsed = parseSourceConfig(file, raw);
      Object.assign(servers, parsed.mcpServers);
      sources.push(file);
    }

    return { servers, sources };
  }
}
