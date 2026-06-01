import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { McpRegistryService } from '../../src/services/McpRegistryService';

describe('McpRegistryService', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = `/tmp/test-mcp-registry-${Date.now()}`;
    await fs.mkdir(path.join(testDir, 'mcp-registry', 'presets'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('loads global and preset servers with preset overriding global by name', async () => {
    await fs.writeFile(
      path.join(testDir, 'mcp-registry', 'global.json'),
      JSON.stringify({
        mcpServers: {
          context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
          docs: { url: 'https://example.com/mcp' }
        }
      })
    );
    await fs.writeFile(
      path.join(testDir, 'mcp-registry', 'presets', 'coding.json'),
      JSON.stringify({
        mcpServers: {
          docs: { command: 'node', args: ['scripts/docs-mcp.js'] }
        }
      })
    );

    const result = await new McpRegistryService(testDir).loadForPreset('coding');

    expect(result.servers.context7).toEqual({ command: 'npx', args: ['-y', '@upstash/context7-mcp'] });
    expect(result.servers.docs).toEqual({ command: 'node', args: ['scripts/docs-mcp.js'] });
    expect(result.sources).toEqual([
      path.join(testDir, 'mcp-registry', 'global.json'),
      path.join(testDir, 'mcp-registry', 'presets', 'coding.json')
    ]);
  });

  it('returns an empty config when registry files are missing', async () => {
    const result = await new McpRegistryService(testDir).loadForPreset('coding');

    expect(result.servers).toEqual({});
    expect(result.sources).toEqual([]);
  });

  it('rejects invalid server shapes with the server name in the error', async () => {
    await fs.writeFile(
      path.join(testDir, 'mcp-registry', 'global.json'),
      JSON.stringify({ mcpServers: { broken: { args: 'not-array' } } })
    );

    await expect(new McpRegistryService(testDir).loadGlobal()).rejects.toThrow('broken');
  });
});
