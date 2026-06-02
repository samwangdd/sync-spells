import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { mkdir, readFile, symlink } from 'fs/promises';
import os from 'os';
import path from 'path';
import { runWorkspaceInit, runWorkspaceDoctor } from '../../src/commands/workspace';
import { defaultManifest, MANIFEST_FILE, writeManifest } from '../../src/lib/workspace';

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

describe('workspace doctor', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-wsdoc-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('reports error for a manifest directory that is missing', async () => {
    await writeManifest(root, { ...defaultManifest });
    const config = { source: root, tools: {} };
    const results = await runWorkspaceDoctor(config, root);
    const lib = results.find((r) => r.check === 'dir:skill-category');
    expect(lib?.status).toBe('error');
  });

  test('reports ok when all manifest directories exist', async () => {
    await writeManifest(root, { ...defaultManifest });
    await mkdir(path.join(root, 'skill-category'));
    await mkdir(path.join(root, 'profiles'));
    await mkdir(path.join(root, 'agents'));
    const config = { source: root, tools: {} };
    const results = await runWorkspaceDoctor(config, root);
    expect(results.filter((r) => r.check.startsWith('dir:')).every((r) => r.status === 'ok')).toBe(true);
  });

  test('reports error for a broken tool skill symlink', async () => {
    await writeManifest(root, { ...defaultManifest });
    await mkdir(path.join(root, 'skill-category'));
    await mkdir(path.join(root, 'profiles'));
    await mkdir(path.join(root, 'agents'));
    const toolBase = path.join(root, 'fake-claude');
    await mkdir(toolBase, { recursive: true });
    await symlink(path.join(root, 'does-not-exist'), path.join(toolBase, 'skills'));
    const config = {
      source: root,
      tools: { 'claude-code': { enabled: true, configPath: toolBase, mappings: [{ from: 'global', to: 'skills' }] } },
    };
    const results = await runWorkspaceDoctor(config, root);
    const link = results.find((r) => r.check === 'symlink:claude-code:skills');
    expect(link?.status).toBe('error');
  });
});
