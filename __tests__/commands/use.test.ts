import { runUse } from '../../src/commands/use';
import { Config } from '../../src/lib/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('use command', () => {
  let testDir: string;
  let config: Config;
  let projectDir: string;

  beforeEach(async () => {
    testDir = `/tmp/test-use-${Date.now()}`;
    projectDir = `/tmp/test-project-${Date.now()}`;

    // Setup registry — global skill
    await fs.mkdir(path.join(testDir, 'global', 'git-commit'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'global', 'git-commit', 'SKILL.md'),
      '# Git Commit'
    );

    // Setup non-global skill for tests that need one
    await fs.mkdir(path.join(testDir, 'coding', 'web-perf'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'coding', 'web-perf', 'SKILL.md'),
      '# Web Perf'
    );

    // Setup profiles
    await fs.mkdir(path.join(testDir, 'profiles'), { recursive: true });

    // 'test' profile: has global + non-global skill.
    // After SP-2 resolve, only 'coding/web-perf' reaches project level (global is excluded).
    await fs.writeFile(
      path.join(testDir, 'profiles', 'test.json'),
      JSON.stringify({
        name: 'test',
        skills: ['global/git-commit', 'coding/web-perf']
      })
    );

    await fs.writeFile(
      path.join(testDir, 'profiles', 'mexc-code.json'),
      JSON.stringify({
        name: 'mexc-code',
        skills: ['global/git-commit', 'coding/web-perf']
      })
    );

    // Setup project
    await fs.mkdir(projectDir, { recursive: true });

    config = {
      source: testDir,
      tools: {},
      profilesDir: path.join(testDir, 'profiles'),
    };
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('should activate profile to project', async () => {
    const result = await runUse(config, projectDir, 'test');

    expect(result.profile).toBe('test');
    // After resolve, global/git-commit is excluded; only coding/web-perf is linked
    // For both .claude and .codex tools → 2 entries total
    expect(result.skills.length).toBeGreaterThan(0);

    const linked = result.skills.filter(s => s.status === 'linked');
    expect(linked.length).toBeGreaterThan(0);

    const state = JSON.parse(await fs.readFile(path.join(projectDir, '.sync-spells.json'), 'utf8'));
    expect(state.activePreset).toBe('test');
    expect(state.activeProfile).toBe('test');
  });

  it('should use inferred profile when no profile specified', async () => {
    const result = await runUse(config, '/Users/sammore/Mexc/frontend');

    expect(result.profile).toBe('mexc-code');
  });

  it('links project skills directly to registry (no active-skills)', async () => {
    const result = await runUse(config, projectDir, 'test');
    expect(result.profile).toBe('test');
    // global/git-commit is filtered out by ResolveService; coding/web-perf is linked
    const target = await fs.readlink(path.join(projectDir, '.codex', 'skills', 'web-perf'));
    expect(target).toBe(path.join(testDir, 'coding', 'web-perf'));
    expect(target).not.toContain('active-skills');
    // global skill must NOT be linked at project level
    await expect(
      fs.access(path.join(projectDir, '.codex', 'skills', 'git-commit'))
    ).rejects.toBeTruthy();
  });

  it('use resolves a category profile and links to project (no global)', async () => {
    await fs.writeFile(path.join(testDir, 'profiles', 'cat.json'),
      JSON.stringify({ name: 'cat', categories: ['coding'] }));
    const result = await runUse(config, projectDir, 'cat');
    const target = await fs.readlink(path.join(projectDir, '.claude', 'skills', 'web-perf'));
    expect(target).toBe(path.join(testDir, 'coding', 'web-perf'));
    await expect(fs.access(path.join(projectDir, '.claude', 'skills', 'git-commit'))).rejects.toBeTruthy();
  });
});
