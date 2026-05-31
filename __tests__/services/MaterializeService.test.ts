import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { MaterializeService } from '../../src/services/MaterializeService';
import { ProfileService } from '../../src/services/ProfileService';
import { Config } from '../../src/lib/config';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('MaterializeService', () => {
  let service: MaterializeService;
  let profileService: ProfileService;
  let testDir: string;

  beforeEach(async () => {
    testDir = `/tmp/test-materialize-${Date.now()}`;

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

    const config: Config = {
      source: testDir,
      tools: {},
      activeDir: path.join(testDir, 'active-skills')
    };

    profileService = new ProfileService(config);
    service = new MaterializeService(config, profileService);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should materialize profile to active directory', async () => {
    const result = await service.materialize('test');

    expect(result.profile).toBe('test');
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].status).toBe('created');

    // Verify symlink was created
    const linkPath = path.join(testDir, 'active-skills', 'test', 'git-commit');
    const target = await fs.readlink(linkPath);
    expect(target).toContain('global/git-commit');
  });

  it('should throw for unknown profile', async () => {
    await expect(service.materialize('unknown')).rejects.toThrow('Profile not found');
  });

  it('should cleanup materialized profile', async () => {
    await service.materialize('test');
    await service.cleanup('test');

    const activeDir = path.join(testDir, 'active-skills', 'test');
    await expect(fs.access(activeDir)).rejects.toThrow();
  });

  it('should report error for missing skill source', async () => {
    // Create a profile referencing a non-existent skill
    await fs.writeFile(
      path.join(testDir, 'profiles', 'missing-skill.json'),
      JSON.stringify({
        name: 'missing-skill',
        skills: ['global/nonexistent']
      })
    );

    const result = await service.materialize('missing-skill');

    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].status).toBe('error');
    expect(result.skills[0].error).toBeDefined();
  });

  it('should include generatedAt timestamp', async () => {
    const result = await service.materialize('test');

    expect(result.generatedAt).toBeDefined();
    const parsed = new Date(result.generatedAt);
    expect(parsed.getTime()).not.toBeNaN();
  });

  it('should replace existing symlink on re-materialize', async () => {
    await service.materialize('test');
    const result = await service.materialize('test');

    expect(result.skills[0].status).toBe('created');
    expect(result.skills).toHaveLength(1);
  });

  it('should use default cache activeDir when config.activeDir is not set', async () => {
    const configNoActiveDir: Config = {
      source: testDir,
      tools: {}
    };

    profileService = new ProfileService(configNoActiveDir);
    service = new MaterializeService(configNoActiveDir, profileService);

    const result = await service.materialize('test');

    expect(result.skills[0].status).toBe('created');

    const defaultActiveDir = path.join(
      testDir,
      '.sync-spells-cache',
      'active-skills',
      'test',
      'git-commit'
    );
    const target = await fs.readlink(defaultActiveDir);
    expect(target).toContain('global/git-commit');
  });

  it('should use cacheDir when activeDir is not set', async () => {
    const configWithCacheDir: Config = {
      source: testDir,
      tools: {},
      cacheDir: path.join(testDir, 'cache')
    };

    profileService = new ProfileService(configWithCacheDir);
    service = new MaterializeService(configWithCacheDir, profileService);

    const result = await service.materialize('test');

    expect(result.skills[0].status).toBe('created');

    const cacheLink = path.join(testDir, 'cache', 'active-skills', 'test', 'git-commit');
    const target = await fs.readlink(cacheLink);
    expect(target).toContain('global/git-commit');
  });

  it('should remove stale symlinks before materializing profile', async () => {
    const profileActiveDir = path.join(testDir, 'active-skills', 'test');
    await fs.mkdir(profileActiveDir, { recursive: true });

    const staleTarget = path.join(testDir, 'global', 'old-skill');
    await fs.mkdir(staleTarget, { recursive: true });
    const staleLink = path.join(profileActiveDir, 'old-skill');
    await fs.symlink(staleTarget, staleLink);

    await service.materialize('test');

    await expect(fs.lstat(staleLink)).rejects.toThrow();
    const activeLink = path.join(profileActiveDir, 'git-commit');
    const target = await fs.readlink(activeLink);
    expect(target).toContain('global/git-commit');
  });
});
