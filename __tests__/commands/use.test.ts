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

    // Setup registry
    await fs.mkdir(path.join(testDir, 'global', 'git-commit'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'global', 'git-commit', 'SKILL.md'),
      '# Git Commit'
    );

    // Setup profiles
    await fs.mkdir(path.join(testDir, 'profiles'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'profiles', 'test.json'),
      JSON.stringify({
        name: 'test',
        skills: ['global/git-commit']
      })
    );
    await fs.writeFile(
      path.join(testDir, 'profiles', 'mexc-code.json'),
      JSON.stringify({
        name: 'mexc-code',
        skills: ['global/git-commit']
      })
    );

    // Setup project
    await fs.mkdir(projectDir, { recursive: true });

    config = {
      source: testDir,
      tools: {},
      profilesDir: path.join(testDir, 'profiles'),
      activeDir: path.join(testDir, 'active-skills')
    };
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('should activate profile to project', async () => {
    const result = await runUse(config, projectDir, 'test');

    expect(result.profile).toBe('test');
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

  it('should use default generated cache when activeDir is not configured', async () => {
    const configWithoutActiveDir: Config = {
      source: testDir,
      tools: {},
      profilesDir: path.join(testDir, 'profiles')
    };

    const result = await runUse(configWithoutActiveDir, projectDir, 'test');

    expect(result.profile).toBe('test');
    const target = await fs.readlink(path.join(projectDir, '.codex', 'skills', 'git-commit'));
    expect(target).toContain(path.join('.sync-spells-cache', 'active-skills', 'test', 'git-commit'));
  });
});
