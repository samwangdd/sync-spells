import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { mkdir, readFile, writeFile, lstat, readlink } from 'fs/promises';
import os from 'os';
import path from 'path';

const loadModules = () => {
  jest.resetModules();
  return {
    config: require('../../src/lib/config') as typeof import('../../src/lib/config'),
    syncAgents: require('../../src/commands/sync-agents') as typeof import('../../src/commands/sync-agents'),
  };
};

const AGENT = `---
name: jira
description: "Jira agent"
model: sonnet
tools: "Skill, Read"
---

Jira agent body.
`;

describe('runAgentSync', () => {
  let home: string;
  let workspace: string;
  let homedirSpy: jest.SpiedFunction<typeof os.homedir>;

  beforeEach(async () => {
    home = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-agenthome-'));
    workspace = mkdtempSync(path.join(os.tmpdir(), 'sync-spells-agentws-'));
    homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(home);
    await mkdir(path.join(workspace, 'agents', 'global'), { recursive: true });
    await writeFile(path.join(workspace, 'agents', 'global', 'jira.md'), AGENT, 'utf8');
  });

  afterEach(() => {
    homedirSpy.mockRestore();
    rmSync(home, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  });

  const writeConfig = async () => {
    const { config } = loadModules();
    await config.writeConfig({
      source: workspace,
      tools: {
        'claude-code': { enabled: true, configPath: path.join(home, '.claude'), mappings: [], agents: { path: path.join(home, '.claude/agents'), format: 'md' } },
        codex: { enabled: true, configPath: path.join(home, '.codex'), mappings: [], agents: { path: path.join(home, '.codex/agents'), format: 'toml' } },
        kiro: { enabled: true, configPath: path.join(home, '.kiro'), mappings: [], agents: { path: path.join(home, '.kiro/agents'), format: 'json' } },
      },
    });
  };

  const writeConfigWithLibrarySource = async () => {
    const { config } = loadModules();
    const library = path.join(workspace, 'skill-category');
    await mkdir(library, { recursive: true });
    await config.writeConfig({
      source: library,
      tools: {
        kiro: { enabled: true, configPath: path.join(home, '.kiro'), mappings: [], agents: { path: path.join(home, '.kiro/agents'), format: 'json' } },
      },
    });
  };

  test('symlinks .md for claude-code (passthrough)', async () => {
    await writeConfig();
    const { syncAgents } = loadModules();
    await syncAgents.runAgentSync();
    const link = path.join(home, '.claude/agents', 'jira.md');
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readlink(link)).toBe(path.join(workspace, 'agents', 'global', 'jira.md'));
  });

  test('writes .toml for codex', async () => {
    await writeConfig();
    const { syncAgents } = loadModules();
    await syncAgents.runAgentSync();
    const out = await readFile(path.join(home, '.codex/agents', 'jira.toml'), 'utf8');
    expect(out).toContain('name = "jira"');
    expect(out).toContain('developer_instructions = """Jira agent body.\n"""');
  });

  test('writes .json for kiro', async () => {
    await writeConfig();
    const { syncAgents } = loadModules();
    await syncAgents.runAgentSync();
    const parsed = JSON.parse(await readFile(path.join(home, '.kiro/agents', 'jira.json'), 'utf8'));
    expect(parsed.name).toBe('jira');
    expect(parsed.model).toBe('claude-sonnet-5');
    expect(parsed.tools).toEqual(['read']);
    expect(parsed.allowedTools).toEqual(['read']);
    expect(parsed.resources).toContain('skill://~/.kiro/skills/*/SKILL.md');
    expect(parsed.includeMcpJson).toBe(true);
  });

  test('finds sibling agents when config source points at skill-category', async () => {
    await writeConfigWithLibrarySource();
    const { syncAgents } = loadModules();
    await syncAgents.runAgentSync();
    const parsed = JSON.parse(await readFile(path.join(home, '.kiro/agents', 'jira.json'), 'utf8'));
    expect(parsed.name).toBe('jira');
  });

  test('backs up a pre-existing real .toml before overwriting', async () => {
    await writeConfig();
    const codexDir = path.join(home, '.codex/agents');
    await mkdir(codexDir, { recursive: true });
    await writeFile(path.join(codexDir, 'jira.toml'), 'OLD CONTENT', 'utf8');
    const { syncAgents } = loadModules();
    const results = await syncAgents.runAgentSync();
    const codexResult = results.find((r) => r.tool === 'codex' && r.agent === 'jira');
    expect(codexResult?.action).toBe('backed-up');
    expect(await readFile(path.join(codexDir, 'jira.toml'), 'utf8')).toContain('name = "jira"');
  });

  test('replaces a pre-existing symlink at the .toml target with a real file', async () => {
    await writeConfig();
    const codexDir = path.join(home, '.codex/agents');
    await mkdir(codexDir, { recursive: true });
    const target = path.join(codexDir, 'jira.toml');
    const { symlink } = await import('fs/promises');
    await symlink(path.join(home, 'nonexistent-target'), target); // stale symlink
    const { syncAgents } = loadModules();
    const results = await syncAgents.runAgentSync();
    expect((await lstat(target)).isSymbolicLink()).toBe(false);
    expect(await readFile(target, 'utf8')).toContain('name = "jira"');
    const codexResult = results.find((r) => r.tool === 'codex' && r.agent === 'jira');
    expect(codexResult?.action).toBe('written');
  });
});
