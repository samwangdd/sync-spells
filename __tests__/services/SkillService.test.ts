import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { SkillService } from '../../src/services/SkillService';
import { Config } from '../../src/lib/config';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('SkillService', () => {
  let service: SkillService;
  let testDir: string;

  beforeEach(async () => {
    testDir = `/tmp/test-skills-${Date.now()}`;

    // Create test registry structure
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

    // A skill without SKILL.md
    await fs.mkdir(path.join(testDir, 'code', 'backend'), { recursive: true });

    await fs.mkdir(path.join(testDir, 'projects', 'lifeos', 'task-run'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'projects', 'lifeos', 'task-run', 'SKILL.md'),
      '# Task Run Skill'
    );

    const config: Config = { source: testDir, tools: {} };
    service = new SkillService(config);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should list all skills', async () => {
    const skills = await service.listSkills();

    expect(skills).toHaveLength(4);
    expect(skills[0].category).toBe('global');
    expect(skills[0].path).toBe('global/git-commit');
    expect(skills[1].category).toBe('code');
    expect(skills.map(skill => skill.path)).toContain('projects/lifeos/task-run');
  });

  it('should list skills by category', async () => {
    const skills = await service.listSkills('code');

    expect(skills).toHaveLength(2);
    expect(skills.every(s => s.category === 'code')).toBe(true);
  });

  it('should detect SKILL.md presence', async () => {
    const skills = await service.listSkills();

    const gitCommit = skills.find(s => s.name === 'git-commit');
    const backend = skills.find(s => s.name === 'backend');

    expect(gitCommit!.hasSkillMd).toBe(true);
    expect(backend!.hasSkillMd).toBe(false);
  });

  it('should validate skill path', async () => {
    const exists = await service.validateSkillPath('global/git-commit');
    expect(exists).toBe(true);

    const missing = await service.validateSkillPath('nonexistent/skill');
    expect(missing).toBe(false);
  });

  it('should globalize a skill and update profile references', async () => {
    const profilesDir = path.join(testDir, 'profiles');
    await fs.mkdir(profilesDir, { recursive: true });
    await fs.writeFile(
      path.join(profilesDir, 'lifeos.json'),
      JSON.stringify({
        name: 'lifeos',
        skills: ['projects/lifeos/task-run', 'global/git-commit']
      })
    );

    const config: Config = {
      source: testDir,
      tools: {},
      profilesDir
    };
    service = new SkillService(config);

    const result = await service.globalizeSkill('projects/lifeos/task-run');

    expect(result.from).toBe('projects/lifeos/task-run');
    expect(result.to).toBe('global/task-run');
    await expect(fs.access(path.join(testDir, 'global', 'task-run', 'SKILL.md'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(testDir, 'projects', 'lifeos', 'task-run'))).rejects.toThrow();

    const profile = JSON.parse(await fs.readFile(path.join(profilesDir, 'lifeos.json'), 'utf8'));
    expect(profile.skills).toEqual(['global/task-run', 'global/git-commit']);
  });

  it('should globalize by unique skill name', async () => {
    const result = await service.globalizeSkill('task-run');

    expect(result.from).toBe('projects/lifeos/task-run');
    expect(result.to).toBe('global/task-run');
    await expect(fs.access(path.join(testDir, 'global', 'task-run'))).resolves.toBeUndefined();
  });

  it('should localize a global skill and update profile references', async () => {
    const profilesDir = path.join(testDir, 'profiles');
    await fs.mkdir(profilesDir, { recursive: true });
    await fs.writeFile(
      path.join(profilesDir, 'lifeos.json'),
      JSON.stringify({
        name: 'lifeos',
        skills: ['global/git-commit', 'projects/lifeos/task-run']
      })
    );

    const config: Config = {
      source: testDir,
      tools: {},
      profilesDir
    };
    service = new SkillService(config);

    const result = await service.localizeSkill('git-commit', 'knowledge');

    expect(result.from).toBe('global/git-commit');
    expect(result.to).toBe('knowledge/git-commit');
    await expect(fs.access(path.join(testDir, 'knowledge', 'git-commit', 'SKILL.md'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(testDir, 'global', 'git-commit'))).rejects.toThrow();

    const profile = JSON.parse(await fs.readFile(path.join(profilesDir, 'lifeos.json'), 'utf8'));
    expect(profile.skills).toEqual(['knowledge/git-commit', 'projects/lifeos/task-run']);
  });

  it('should fail localize when target category is global', async () => {
    await expect(service.localizeSkill('git-commit', 'global')).rejects.toThrow('Local category cannot be global');
  });

  it('should fail globalize for ambiguous skill names', async () => {
    await fs.mkdir(path.join(testDir, 'inbox', 'task-run'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'inbox', 'task-run', 'SKILL.md'),
      '# Inbox Task Run'
    );

    await expect(service.globalizeSkill('task-run')).rejects.toThrow('Ambiguous skill name');
  });

  it('should fail globalize when target already exists', async () => {
    await fs.mkdir(path.join(testDir, 'global', 'task-run'), { recursive: true });

    await expect(service.globalizeSkill('projects/lifeos/task-run')).rejects.toThrow('Global skill already exists');
  });

  it('should fail globalize for missing skill', async () => {
    await expect(service.globalizeSkill('missing-skill')).rejects.toThrow('Skill not found');
  });

  it('should fail globalize for container directories', async () => {
    await expect(service.globalizeSkill('projects/lifeos')).rejects.toThrow('Skill not found');
  });
});
