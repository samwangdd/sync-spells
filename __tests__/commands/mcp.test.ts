import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Config } from '../../src/lib/config';
import { runMcpGlobalSync, runMcpStatus, runMcpUse } from '../../src/commands/mcp';

describe('mcp command', () => {
  let testDir: string;
  let projectDir: string;
  let config: Config;

  beforeEach(async () => {
    testDir = `/tmp/test-mcp-command-${Date.now()}`;
    projectDir = path.join(testDir, 'project');
    await fs.mkdir(path.join(testDir, 'source', 'mcp-registry', 'presets'), { recursive: true });
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'source', 'mcp-registry', 'global.json'),
      JSON.stringify({ mcpServers: { context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] } } })
    );
    await fs.writeFile(
      path.join(testDir, 'source', 'mcp-registry', 'presets', 'coding.json'),
      JSON.stringify({ mcpServers: { local: { command: 'node', args: ['server.js'] } } })
    );

    config = {
      source: path.join(testDir, 'source'),
      tools: {
        'claude-code': { enabled: true, configPath: path.join(testDir, 'claude'), mappings: [] },
        cursor: { enabled: true, configPath: path.join(testDir, 'cursor'), mappings: [] },
        codex: { enabled: true, configPath: path.join(testDir, 'codex'), mappings: [] },
        agents: { enabled: false, configPath: path.join(testDir, 'agents'), mappings: [] }
      },
      projectBindings: [{ path: testDir, profile: 'coding' }]
    };
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('dry-runs global sync without writing target files', async () => {
    const result = await runMcpGlobalSync(config, {
      dryRun: true,
      forceAdopt: false,
      manifestPath: path.join(testDir, 'manifest.json')
    });

    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ tool: 'claude-code', scope: 'global', server: 'context7', action: 'add' }),
      expect.objectContaining({ tool: 'cursor', scope: 'global', server: 'context7', action: 'add' }),
      expect.objectContaining({ tool: 'codex', scope: 'global', server: 'context7', action: 'add' })
    ]));
    await expect(fs.access(path.join(testDir, 'cursor', 'mcp.json'))).rejects.toBeTruthy();
  });

  it('writes project MCP targets for an explicit preset', async () => {
    const result = await runMcpUse(config, projectDir, 'coding', {
      dryRun: false,
      forceAdopt: false,
      manifestPath: path.join(testDir, 'manifest.json')
    });

    expect(result.preset).toBe('coding');
    expect(result.changes.some((change) => change.targetPath.endsWith('.mcp.json'))).toBe(true);
    expect(JSON.parse(await fs.readFile(path.join(projectDir, '.mcp.json'), 'utf8')).mcpServers.local).toEqual({
      command: 'node',
      args: ['server.js']
    });
    expect(await fs.readFile(path.join(projectDir, '.codex', 'config.toml'), 'utf8')).toContain('[mcp_servers.local]');

    const state = JSON.parse(await fs.readFile(path.join(projectDir, '.sync-spells.json'), 'utf8'));
    expect(state.activeMcpPreset).toBe('coding');
  });

  it('reports status with inferred preset and registry availability', async () => {
    const status = await runMcpStatus(config, projectDir);

    expect(status.inferredPreset).toBe('coding');
    expect(status.registry.global).toBe(true);
    expect(status.registry.presets).toContain('coding');
  });
});
