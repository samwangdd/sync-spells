import { SkillService } from '../../src/services/SkillService';
import { Config } from '../../src/lib/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('SkillService extended', () => {
  let service: SkillService;
  let testDir: string;

  beforeEach(async () => {
    testDir = `/tmp/test-skill-extended-${Date.now()}`;
    await fs.mkdir(testDir, { recursive: true });

    const config: Config = { source: testDir, tools: {} };
    service = new SkillService(config);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should create a new skill with SKILL.md and an eval suite skeleton', async () => {
    const skillPath = await service.createSkill('my-skill', 'inbox');

    expect(skillPath).toContain('inbox/my-skill');

    const skillMd = await fs.readFile(path.join(testDir, 'inbox', 'my-skill', 'SKILL.md'), 'utf8');
    expect(skillMd).toContain('my-skill');
    const evals = JSON.parse(await fs.readFile(
      path.join(testDir, 'inbox', 'my-skill', 'evals', 'evals.json'),
      'utf8',
    ));
    expect(evals).toEqual({
      schema_version: 1,
      skill: 'my-skill',
      evaluation_protocol: 'Run with isolated baseline and current skill snapshots.',
      cases: [],
    });
  });

  it('should not overwrite existing SKILL.md', async () => {
    await service.createSkill('existing-skill', 'inbox');
    const firstContent = await fs.readFile(
      path.join(testDir, 'inbox', 'existing-skill', 'SKILL.md'), 'utf8'
    );

    // Modify it
    await fs.writeFile(
      path.join(testDir, 'inbox', 'existing-skill', 'SKILL.md'),
      'Modified content', 'utf8'
    );

    await service.createSkill('existing-skill', 'inbox');
    const secondContent = await fs.readFile(
      path.join(testDir, 'inbox', 'existing-skill', 'SKILL.md'), 'utf8'
    );

    expect(secondContent).toBe('Modified content');
  });

  it('should add skill from source path', async () => {
    const sourceDir = `/tmp/test-skill-source-${Date.now()}`;
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'SKILL.md'), '# Source Skill');
    await fs.writeFile(path.join(sourceDir, 'helper.ts'), 'export const x = 1;');

    await service.addSkill(sourceDir, 'inbox/imported-skill');

    const files = await fs.readdir(path.join(testDir, 'inbox', 'imported-skill'));
    expect(files).toContain('SKILL.md');
    expect(files).toContain('helper.ts');

    await fs.rm(sourceDir, { recursive: true, force: true });
  });
});
