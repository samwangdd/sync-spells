import { runMaterialize } from '../../src/commands/materialize';
import { Config } from '../../src/lib/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('materialize command', () => {
  let testDir: string;
  let config: Config;

  beforeEach(async () => {
    testDir = `/tmp/test-materialize-cmd-${Date.now()}`;

    await fs.mkdir(path.join(testDir, 'global', 'git-commit'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'global', 'git-commit', 'SKILL.md'),
      '# Git Commit'
    );

    await fs.mkdir(path.join(testDir, 'profiles'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'profiles', 'test.json'),
      JSON.stringify({ name: 'test', skills: ['global/git-commit'] })
    );

    config = {
      source: testDir,
      tools: {},
      profilesDir: path.join(testDir, 'profiles'),
      activeDir: path.join(testDir, 'active-skills')
    };
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should materialize profile', async () => {
    const result = await runMaterialize(config, 'test');

    expect(result.profile).toBe('test');
    expect(result.skills).toHaveLength(1);
  });

  it('should throw for unknown profile', async () => {
    await expect(runMaterialize(config, 'unknown')).rejects.toThrow('Profile not found');
  });
});
