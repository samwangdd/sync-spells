import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { readFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { runWorkspaceInit } from '../../src/commands/workspace';
import { defaultManifest, MANIFEST_FILE } from '../../src/lib/workspace';

describe('workspace init', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-wsinit-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('writes default manifest and reports created', async () => {
    const result = await runWorkspaceInit(root);
    expect(result.action).toBe('created');
    const raw = await readFile(path.join(root, MANIFEST_FILE), 'utf8');
    expect(JSON.parse(raw)).toEqual(defaultManifest);
  });

  test('is idempotent — second run reports unchanged', async () => {
    await runWorkspaceInit(root);
    const result = await runWorkspaceInit(root);
    expect(result.action).toBe('unchanged');
  });
});
