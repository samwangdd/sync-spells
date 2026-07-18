import { runProfilesList, runProfilesShow } from '../../src/commands/profiles';
import { Config } from '../../src/lib/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('profiles command', () => {
  let testDir: string;
  let config: Config;

  beforeEach(async () => {
    testDir = `/tmp/test-profiles-cmd-${Date.now()}`;

    await fs.mkdir(path.join(testDir, 'profiles'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'profiles', 'test.json'),
      JSON.stringify({
        name: 'test',
        description: 'Test profile',
        skills: ['global/git-commit']
      })
    );

    config = {
      source: testDir,
      tools: {},
      profilesDir: path.join(testDir, 'profiles')
    };
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should list profiles', async () => {
    const profiles = await runProfilesList(config);

    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('test');
    expect(profiles[0].description).toBe('Test profile');
  });

  it('should show profile details', async () => {
    const { profile, validation } = await runProfilesShow(config, 'test');

    expect(profile).not.toBeNull();
    expect(profile!.name).toBe('test');
    expect(validation).not.toBeNull();
  });

  it('should return null profile for unknown name', async () => {
    const { profile } = await runProfilesShow(config, 'unknown');

    expect(profile).toBeNull();
  });

  it('should resolve skills for a recipe profile (categories + extras)', async () => {
    await fs.mkdir(path.join(testDir, 'foundation', 'evolution'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'foundation', 'picky'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'coding', 'tdd'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'profiles', 'recipe.json'),
      JSON.stringify({
        name: 'recipe',
        categories: ['foundation'],
        extras: ['coding/tdd']
      })
    );

    const { profile, resolved } = await runProfilesShow(config, 'recipe');

    expect(profile).not.toBeNull();
    expect(resolved).not.toBeNull();
    expect(resolved!.skills).toEqual([
      'foundation/evolution',
      'foundation/picky',
      'coding/tdd'
    ]);
  });
});
