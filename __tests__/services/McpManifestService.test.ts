import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { McpManifestService } from '../../src/services/McpManifestService';

describe('McpManifestService', () => {
  let testDir: string;
  let manifestPath: string;

  beforeEach(async () => {
    testDir = `/tmp/test-mcp-manifest-${Date.now()}`;
    manifestPath = path.join(testDir, 'mcp-manifest.json');
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('returns an empty manifest when missing', async () => {
    const service = new McpManifestService(manifestPath);

    await expect(service.read()).resolves.toEqual({ targets: {} });
  });

  it('tracks owned entries by target key', async () => {
    const service = new McpManifestService(manifestPath);
    await service.write({ targets: { 'codex:global': ['context7'] } });

    expect(await service.owns('codex:global', 'context7')).toBe(true);
    expect(await service.owns('codex:global', 'manual')).toBe(false);
  });

  it('updates a target entry list deterministically', async () => {
    const service = new McpManifestService(manifestPath);
    await service.write({ targets: { 'codex:global': ['old'], 'cursor:global': ['manual'] } });
    await service.setOwnedEntries('codex:global', ['zeta', 'alpha']);

    const manifest = await service.read();
    expect(manifest.targets).toEqual({
      'codex:global': ['alpha', 'zeta'],
      'cursor:global': ['manual']
    });
  });
});
