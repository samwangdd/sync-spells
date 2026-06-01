import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { McpTargetService } from '../../src/services/McpTargetService';
import { McpManifestService } from '../../src/services/McpManifestService';

describe('McpTargetService', () => {
  let testDir: string;
  let manifest: McpManifestService;

  beforeEach(async () => {
    testDir = `/tmp/test-mcp-target-${Date.now()}`;
    await fs.mkdir(testDir, { recursive: true });
    manifest = new McpManifestService(path.join(testDir, 'manifest.json'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('merges owned JSON entries and preserves unmanaged entries', async () => {
    const targetPath = path.join(testDir, '.cursor', 'mcp.json');
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, JSON.stringify({
      mcpServers: {
        manual: { command: 'node', args: ['manual.js'] },
        context7: { command: 'old' }
      }
    }, null, 2));
    await manifest.write({ targets: { 'cursor:global': ['context7'] } });

    const changes = await new McpTargetService(manifest).writeJsonTarget({
      tool: 'cursor',
      scope: 'global',
      targetPath,
      servers: { context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] } },
      dryRun: false,
      forceAdopt: false
    });

    expect(changes.map((change) => change.action)).toEqual(['update']);
    const written = JSON.parse(await fs.readFile(targetPath, 'utf8'));
    expect(written.mcpServers.manual).toEqual({ command: 'node', args: ['manual.js'] });
    expect(written.mcpServers.context7).toEqual({ command: 'npx', args: ['-y', '@upstash/context7-mcp'] });
  });

  it('reports conflicts for unmanaged JSON entries', async () => {
    const targetPath = path.join(testDir, '.mcp.json');
    await fs.writeFile(targetPath, JSON.stringify({ mcpServers: { context7: { command: 'manual' } } }));

    const changes = await new McpTargetService(manifest).writeJsonTarget({
      tool: 'claude-code',
      scope: 'project',
      targetPath,
      servers: { context7: { command: 'npx' } },
      dryRun: false,
      forceAdopt: false
    });

    expect(changes).toEqual([
      expect.objectContaining({ action: 'conflict', server: 'context7' })
    ]);
    const written = JSON.parse(await fs.readFile(targetPath, 'utf8'));
    expect(written.mcpServers.context7).toEqual({ command: 'manual' });
  });

  it('writes Codex TOML MCP tables and preserves unrelated settings', async () => {
    const targetPath = path.join(testDir, 'config.toml');
    await fs.writeFile(targetPath, 'model = "gpt-5"\n\n[mcp_servers.manual]\ncommand = "node"\nargs = ["manual.js"]\n');

    const changes = await new McpTargetService(manifest).writeCodexTarget({
      tool: 'codex',
      scope: 'global',
      targetPath,
      servers: { context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] } },
      dryRun: false,
      forceAdopt: false
    });

    expect(changes).toEqual([
      expect.objectContaining({ action: 'add', server: 'context7' })
    ]);
    const written = await fs.readFile(targetPath, 'utf8');
    expect(written).toContain('model = "gpt-5"');
    expect(written).toContain('[mcp_servers.manual]');
    expect(written).toContain('[mcp_servers.context7]');
    expect(written).toContain('command = "npx"');
    expect(written).toContain('args = ["-y", "@upstash/context7-mcp"]');
  });
});
