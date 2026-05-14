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

    const config: Config = { source: testDir, tools: {} };
    service = new SkillService(config);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should list all skills', async () => {
    const skills = await service.listSkills();

    expect(skills).toHaveLength(3);
    expect(skills[0].category).toBe('global');
    expect(skills[0].path).toBe('global/git-commit');
    expect(skills[1].category).toBe('code');
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
});
