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

  it('should prefer configured project bindings over fallback rules', () => {
    const cfg: Config = {
      ...config,
      projectBindings: [
        { path: '/Users/sammore/codeLab', profile: 'coding' },
        { path: '/Users/sammore/codeLab/MEXC', profile: 'mexc-code' },
      ],
    };
    const svc = new ProjectService(cfg, new ProfileService(cfg));

    const match = svc.inferProfileMatch('/Users/sammore/codeLab/MEXC/ww-v3');

    expect(match?.profile).toBe('mexc-code');
    expect(match?.patternText).toBe('binding:/Users/sammore/codeLab/MEXC');
  });

  it('should use the longest matching configured binding', () => {
    const cfg: Config = {
      ...config,
      projectBindings: [
        { path: '/Users/sammore/codeLab', profile: 'coding' },
        { path: '/Users/sammore/codeLab/MEXC', profile: 'mexc-code' },
      ],
    };
    const svc = new ProjectService(cfg, new ProfileService(cfg));

    expect(svc.inferProfile('/Users/sammore/codeLab/sync-spells')).toBe('coding');
    expect(svc.inferProfile('/Users/sammore/codeLab/MEXC/ww-v3-worktree')).toBe('mexc-code');
  });

  it('should explain the matched inference rule', () => {
    const match = service.inferProfileMatch('/Users/sammore/Mexc/frontend');
    expect(match?.profile).toBe('mexc-code');
    expect(match?.patternText).toBe('/Mexc/i');
  });

  it('should infer lifeos-knowledge profile for LifeOS paths', () => {
    const profile = service.inferProfile('/Users/sammore/LifeOS/docs');
    expect(profile).toBe('lifeos-knowledge');
  });

  it('should fallback to global for unknown paths', () => {
    const profile = service.inferProfile('/Users/sammore/other-project');
    expect(profile).toBe('global');
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

  it('activateProfile links project skills directly to registry', async () => {
    await fs.mkdir(path.join(testDir, 'global', 'git-commit'), { recursive: true });
    await fs.writeFile(path.join(testDir, 'global', 'git-commit', 'SKILL.md'), '# x');
    await fs.mkdir(path.join(testDir, 'profiles'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'profiles', 'test.json'),
      JSON.stringify({ name: 'test', skills: ['global/git-commit'] }),
    );

    const cfg: Config = { source: testDir, tools: {}, profilesDir: path.join(testDir, 'profiles') };
    const svc = new ProjectService(cfg, new ProfileService(cfg));
    const projectDir = path.join(testDir, 'proj');

    await svc.activateProfile(projectDir, 'test');

    const target = await fs.readlink(path.join(projectDir, '.claude', 'skills', 'git-commit'));
    expect(target).toBe(path.join(testDir, 'global', 'git-commit'));
    expect(target).not.toContain('active-' + 'skills');
  });
});
