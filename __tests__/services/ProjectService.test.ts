import { ProjectService } from '../../src/services/ProjectService';
import { ProfileService } from '../../src/services/ProfileService';
import { Config } from '../../src/lib/config';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('ProjectService', () => {
  let service: ProjectService;
  let config: Config;
  let testDir: string;

  beforeEach(async () => {
    testDir = `/tmp/test-project-${Date.now()}`;
    await fs.mkdir(testDir, { recursive: true });

    config = {
      source: testDir,
      tools: {}
    };

    const profileService = new ProfileService(config);
    service = new ProjectService(config, profileService);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should infer mexc-code profile for Mexc paths', () => {
    const profile = service.inferProfile('/Users/sammore/Mexc/frontend');
    expect(profile).toBe('mexc-code');
  });

  it('should infer lifeos-knowledge profile for LifeOS paths', () => {
    const profile = service.inferProfile('/Users/sammore/LifeOS/docs');
    expect(profile).toBe('lifeos-knowledge');
  });

  it('should fallback to global-lite for unknown paths', () => {
    const profile = service.inferProfile('/Users/sammore/other-project');
    expect(profile).toBe('global-lite');
  });

  it('should return null when no rules match (empty rules)', () => {
    const profileService = new ProfileService(config);
    const emptyService = new ProjectService(config, profileService, []);
    const profile = emptyService.inferProfile('/any/path');
    expect(profile).toBeNull();
  });

  it('should get active profile from state file', async () => {
    await fs.writeFile(
      path.join(testDir, '.sync-spells.json'),
      JSON.stringify({ activeProfile: 'test-profile' })
    );

    const activeProfile = await service.getActiveProfile(testDir);
    expect(activeProfile).toBe('test-profile');
  });

  it('should prefer active preset from state file', async () => {
    await fs.writeFile(
      path.join(testDir, '.sync-spells.json'),
      JSON.stringify({ activePreset: 'coding', activeProfile: 'old-profile' })
    );

    const activeProfile = await service.getActiveProfile(testDir);
    expect(activeProfile).toBe('coding');
  });

  it('should return null when no state file exists', async () => {
    const activeProfile = await service.getActiveProfile(testDir);
    expect(activeProfile).toBeNull();
  });
});
