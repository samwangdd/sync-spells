import * as fs from 'fs/promises';
import * as path from 'path';
import { McpChange, McpScope, McpServerConfig, McpToolKey } from '../types/mcp';
import { McpManifestService } from './McpManifestService';

interface WriteTargetOptions {
  tool: McpToolKey;
  scope: McpScope;
  targetPath: string;
  servers: Record<string, McpServerConfig>;
  dryRun: boolean;
  forceAdopt: boolean;
}

const targetKey = (tool: McpToolKey, scope: McpScope): string => `${tool}:${scope}`;

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const readTextIfExists = async (filePath: string): Promise<string> => {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }

    throw error;
  }
};

const stringifyTomlValue = (value: string | string[] | boolean | Record<string, string>): string => {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => JSON.stringify(entry)).join(', ')}]`;
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  const pairs = Object.entries(value).map(([key, entry]) => `${JSON.stringify(key)} = ${JSON.stringify(entry)}`);
  return `{ ${pairs.join(', ')} }`;
};

const renderCodexServer = (name: string, server: McpServerConfig): string => {
  const lines = [`[mcp_servers.${name}]`];

  if (server.command !== undefined) lines.push(`command = ${stringifyTomlValue(server.command)}`);
  if (server.args !== undefined) lines.push(`args = ${stringifyTomlValue(server.args)}`);
  if (server.env !== undefined) lines.push(`env = ${stringifyTomlValue(server.env)}`);
  if (server.url !== undefined) lines.push(`url = ${stringifyTomlValue(server.url)}`);
  if (server.headers !== undefined) lines.push(`headers = ${stringifyTomlValue(server.headers)}`);
  if (server.disabled !== undefined) lines.push(`disabled = ${stringifyTomlValue(server.disabled)}`);
  if (server.disabledTools !== undefined) lines.push(`disabledTools = ${stringifyTomlValue(server.disabledTools)}`);

  return lines.join('\n');
};

const removeCodexServerBlock = (content: string, name: string): string => {
  const lines = content.split('\n');
  const output: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const table = line.match(/^\s*\[([^\]]+)\]\s*$/);

    if (table) {
      skipping = table[1] === `mcp_servers.${name}`;
    }

    if (!skipping) {
      output.push(line);
    }
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const codexHasServer = (content: string, name: string): boolean => {
  return new RegExp(`^\\s*\\[mcp_servers\\.${escapeRegExp(name)}\\]\\s*$`, 'm').test(content);
};

export class McpTargetService {
  constructor(private manifest: McpManifestService) {}

  async writeJsonTarget(options: WriteTargetOptions): Promise<McpChange[]> {
    const key = targetKey(options.tool, options.scope);
    const raw = await readTextIfExists(options.targetPath);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const root =
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    const existingServers =
      typeof root.mcpServers === 'object' && root.mcpServers !== null && !Array.isArray(root.mcpServers)
        ? (root.mcpServers as Record<string, unknown>)
        : {};
    const nextServers = { ...existingServers };
    const changes: McpChange[] = [];
    const owned = (await this.manifest.read()).targets[key] || [];

    for (const [name, server] of Object.entries(options.servers)) {
      const exists = Object.prototype.hasOwnProperty.call(existingServers, name);
      const isOwned = owned.includes(name);

      if (exists && !isOwned && !options.forceAdopt) {
        changes.push({
          tool: options.tool,
          scope: options.scope,
          server: name,
          action: 'conflict',
          targetPath: options.targetPath
        });
        continue;
      }

      const action = exists ? (sameJson(existingServers[name], server) ? 'skip' : 'update') : 'add';
      changes.push({ tool: options.tool, scope: options.scope, server: name, action, targetPath: options.targetPath });
      nextServers[name] = server;
    }

    if (!options.dryRun && !changes.some((change) => change.action === 'conflict')) {
      root.mcpServers = nextServers;
      await fs.mkdir(path.dirname(options.targetPath), { recursive: true });
      await fs.writeFile(options.targetPath, `${JSON.stringify(root, null, 2)}\n`, 'utf8');
      await this.manifest.addOwnedEntries(key, Object.keys(options.servers));
    }

    return changes;
  }

  async writeCodexTarget(options: WriteTargetOptions): Promise<McpChange[]> {
    const key = targetKey(options.tool, options.scope);
    let content = await readTextIfExists(options.targetPath);
    const owned = (await this.manifest.read()).targets[key] || [];
    const changes: McpChange[] = [];

    for (const [name, server] of Object.entries(options.servers)) {
      const exists = codexHasServer(content, name);
      const isOwned = owned.includes(name);

      if (exists && !isOwned && !options.forceAdopt) {
        changes.push({
          tool: options.tool,
          scope: options.scope,
          server: name,
          action: 'conflict',
          targetPath: options.targetPath
        });
        continue;
      }

      changes.push({
        tool: options.tool,
        scope: options.scope,
        server: name,
        action: exists ? 'update' : 'add',
        targetPath: options.targetPath
      });
      content = removeCodexServerBlock(content, name);
      content = `${content.trimEnd()}\n\n${renderCodexServer(name, server)}\n`;
    }

    if (!options.dryRun && !changes.some((change) => change.action === 'conflict')) {
      await fs.mkdir(path.dirname(options.targetPath), { recursive: true });
      await fs.writeFile(options.targetPath, content.trimStart(), 'utf8');
      await this.manifest.addOwnedEntries(key, Object.keys(options.servers));
    }

    return changes;
  }
}
