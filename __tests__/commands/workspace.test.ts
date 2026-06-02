import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { access, mkdir, readFile, symlink, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { runWorkspaceInit, runWorkspaceDoctor, runWorkspaceMigrate } from '../../src/commands/workspace';
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

describe('workspace migrate', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-wsmig-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('creates missing manifest directories and reports them', async () => {
    await writeManifest(root, { ...defaultManifest });
    const result = await runWorkspaceMigrate(root);
    expect(result.created.sort()).toEqual(['agents', 'profiles', 'skill-category']);
    await expect(access(path.join(root, 'skill-category'))).resolves.toBeUndefined();
    await expect(access(path.join(root, 'agents'))).resolves.toBeUndefined();
    await expect(access(path.join(root, 'profiles'))).resolves.toBeUndefined();
  });

  test('creates nothing when all directories already exist', async () => {
    await writeManifest(root, { ...defaultManifest });
    await mkdir(path.join(root, 'skill-category'));
    await mkdir(path.join(root, 'profiles'));
    await mkdir(path.join(root, 'agents'));
    const result = await runWorkspaceMigrate(root);
    expect(result.created).toEqual([]);
  });
});

describe('workspace doctor — agent passthrough symlinks', () => {
  let root: string;

  beforeEach(async () => {
    root = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-wsdoc-agents-'));
    await writeManifest(root, { ...defaultManifest });
    await mkdir(path.join(root, 'skill-category'));
    await mkdir(path.join(root, 'profiles'));
    await mkdir(path.join(root, 'agents', 'global'), { recursive: true });
    await writeFile(
      path.join(root, 'agents', 'global', 'jira.md'),
      '---\nname: jira\ndescription: "Jira agent"\n---\nbody\n',
      'utf8',
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const mdToolConfig = (toolAgentsDir: string) => ({
    source: root,
    tools: {
      'claude-code': {
        enabled: true,
        configPath: path.join(root, 'fc'),
        mappings: [],
        agents: { path: toolAgentsDir, format: 'md' as const },
      },
    },
  });

  test('reports error for a broken agent passthrough symlink', async () => {
    const toolAgentsDir = path.join(root, 'claude-agents');
    await mkdir(toolAgentsDir, { recursive: true });
    await symlink(path.join(root, 'nope'), path.join(toolAgentsDir, 'jira.md'));
    const results = await runWorkspaceDoctor(mdToolConfig(toolAgentsDir), root);
    expect(results.find((r) => r.check === 'agent:claude-code:jira')?.status).toBe('error');
  });

  test('reports ok for a valid agent passthrough symlink', async () => {
    const toolAgentsDir = path.join(root, 'claude-agents');
    await mkdir(toolAgentsDir, { recursive: true });
    await symlink(
      path.join(root, 'agents', 'global', 'jira.md'),
      path.join(toolAgentsDir, 'jira.md'),
    );
    const results = await runWorkspaceDoctor(mdToolConfig(toolAgentsDir), root);
    expect(results.find((r) => r.check === 'agent:claude-code:jira')?.status).toBe('ok');
  });

  test('does not check agent symlinks for toml/json tools (they generate files, not symlinks)', async () => {
    const config = {
      source: root,
      tools: {
        codex: {
          enabled: true,
          configPath: path.join(root, 'cx'),
          mappings: [],
          agents: { path: path.join(root, 'codex-agents'), format: 'toml' as const },
        },
      },
    };
    const results = await runWorkspaceDoctor(config, root);
    expect(results.some((r) => r.check.startsWith('agent:'))).toBe(false);
  });
});
