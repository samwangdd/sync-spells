import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../lib/config';
import { SkillInfo, SkillCategory } from '../types';

export class SkillService {
  constructor(private config: Config) {}

  async listSkills(category?: SkillCategory): Promise<SkillInfo[]> {
    const registryDir = this.config.source;
    const categories: SkillCategory[] = category
      ? [category]
      : ['global', 'code', 'lifeos', 'inbox'];

    const skills: SkillInfo[] = [];

    for (const cat of categories) {
      const catDir = path.join(registryDir, cat);

      try {
        await fs.access(catDir);
      } catch {
        continue;
      }

      await this.scanCategory(catDir, cat, skills);
    }

    return skills;
  }

  private async scanCategory(
    dir: string,
    category: SkillCategory,
    skills: SkillInfo[]
  ): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(dir, entry.name);
        const hasSkillMd = await this.checkSkillMd(skillPath);

        skills.push({
          path: `${category}/${entry.name}`,
          category,
          name: entry.name,
          hasSkillMd
        });
      }
    }
  }

  private async checkSkillMd(skillPath: string): Promise<boolean> {
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    try {
      await fs.access(skillMdPath);
      return true;
    } catch {
      return false;
    }
  }

  async validateSkillPath(skillPath: string): Promise<boolean> {
    const fullPath = path.join(this.config.source, skillPath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}
