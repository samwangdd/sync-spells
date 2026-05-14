import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { ProfileService } from '../../src/services/ProfileService';
import { Config } from '../../src/lib/config';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('ProfileService', () => {
  let service: ProfileService;
  let testDir: string;

  beforeEach(async () => {
    testDir = `/tmp/test-profiles-${Date.now()}`;
    await fs.mkdir(testDir, { recursive: true });

    await fs.mkdir(path.join(testDir, 'profiles'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'profiles', 'test-profile.json'),
      JSON.stringify({
        name: 'test-profile',
        description: 'Test profile',
        skills: ['global/git-commit']
      })
    );

    const config: Config = {
      source: testDir,
      tools: {},
      profilesDir: path.join(testDir, 'profiles')
    };

    service = new ProfileService(config);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should list all profiles', async () => {
    const profiles = await service.listProfiles();

    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('test-profile');
    expect(profiles[0].skills).toEqual(['global/git-commit']);
  });

  it('should get profile by name', async () => {
    const profile = await service.getProfile('test-profile');

    expect(profile).not.toBeNull();
    expect(profile!.name).toBe('test-profile');
  });

  it('should return null for unknown profile', async () => {
    const profile = await service.getProfile('unknown');

    expect(profile).toBeNull();
  });

  it('should validate profile with warnings for missing skills', async () => {
    const profile = {
      name: 'test-profile',
      skills: ['global/git-commit']
    };

    const result = await service.validateProfile(profile);

    expect(result.valid).toBe(true);
    expect(result.warnings).toContain('Skill path does not exist: global/git-commit');
  });

  it('should validate profile with error for empty name', async () => {
    const profile = {
      name: '',
      skills: ['global/git-commit']
    };

    const result = await service.validateProfile(profile);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Profile name is required');
  });
});
