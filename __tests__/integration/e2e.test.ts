import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { ProfileService } from '../../src/services/ProfileService';
import { SkillService } from '../../src/services/SkillService';
import { ProjectService } from '../../src/services/ProjectService';
import { runDoctor } from '../../src/commands/doctor';
import { Config } from '../../src/lib/config';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('E2E Integration', () => {
  let testDir: string;
  let projectDir: string;
  let config: Config;

  beforeAll(async () => {
    testDir = `/tmp/syncspells-e2e-${Date.now()}`;
    projectDir = `/tmp/syncspells-e2e-project-${Date.now()}`;

    // Setup registry
    await fs.mkdir(path.join(testDir, 'global', 'git-commit'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'global', 'git-commit', 'SKILL.md'),
      '# Git Commit Skill'
    );

    await fs.mkdir(path.join(testDir, 'code', 'frontend'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'code', 'frontend', 'SKILL.md'),
      '# Frontend Skill'
    );

    // Setup profiles
    await fs.mkdir(path.join(testDir, 'profiles'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'profiles', 'mexc-code.json'),
      JSON.stringify({
        name: 'mexc-code',
        description: 'Mexc coding profile',
        skills: ['global/git-commit', 'code/frontend']
      })
    );

    // Setup project directory
    await fs.mkdir(projectDir, { recursive: true });

    config = {
      source: testDir,
      tools: {},
      profilesDir: path.join(testDir, 'profiles'),
      activeDir: path.join(testDir, 'active-skills')
    };
  });

  afterEach(async () => {
    // Clean up project symlinks between tests, but keep testDir alive
    try {
      await fs.rm(path.join(projectDir, '.claude'), { recursive: true, force: true });
    } catch {}
    try {
      await fs.rm(path.join(projectDir, '.codex'), { recursive: true, force: true });
    } catch {}
    try {
      await fs.rm(config.activeDir!, { recursive: true, force: true });
    } catch {}
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('should complete full workflow: skills -> profiles -> activate -> doctor', async () => {
    // Step 1: List skills in registry
    const skillSvc = new SkillService(config);
    const skills = await skillSvc.listSkills();
    expect(skills).toHaveLength(2);
    expect(skills.map(s => s.name)).toContain('git-commit');
    expect(skills.map(s => s.name)).toContain('frontend');

    // Step 2: List and validate profiles
    const profileSvc = new ProfileService(config);
    const profiles = await profileSvc.listProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('mexc-code');

    const validation = await profileSvc.validateProfile(profiles[0]);
    expect(validation.valid).toBe(true);

    // Step 3: Activate profile in project (direct registry link — no materialize step)
    const projectSvc = new ProjectService(config, profileSvc);
    const activated = await projectSvc.activateProfile(projectDir, 'mexc-code');
    expect(activated.profile).toBe('mexc-code');
    expect(activated.skills.length).toBeGreaterThan(0);

    const linked = activated.skills.filter(s => s.status === 'linked');
    expect(linked.length).toBe(4); // 2 skills x 2 tools (.claude + .codex)

    // Step 4: Run doctor
    const doctorResults = await runDoctor(config);
    expect(doctorResults.some(r => r.check === 'registry' && r.status === 'ok')).toBe(true);
    expect(doctorResults.some(r => r.check === 'profiles' && r.status === 'ok')).toBe(true);
  });

  it('should infer profile from project path', () => {
    const profileSvc = new ProfileService(config);
    const projectSvc = new ProjectService(config, profileSvc);

    expect(projectSvc.inferProfile('/Users/sammore/Mexc/frontend')).toBe('mexc-code');
    expect(projectSvc.inferProfile('/Users/sammore/other')).toBe('global-lite');
  });
});
