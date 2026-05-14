import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../lib/config';
import { SkillInfo, SkillCategory } from '../types';

const ensureWithin = (base: string, ...segments: string[]): string => {
  const resolved = path.resolve(base, ...segments);
  if (!resolved.startsWith(path.resolve(base) + path.sep) && resolved !== path.resolve(base)) {
    throw new Error(`Path traversal detected: ${segments.join('/')}`);
  }
  return resolved;
};

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

  async addSkill(sourcePath: string, targetPath: string): Promise<void> {
    const targetFullPath = ensureWithin(this.config.source, targetPath);

    await fs.mkdir(targetFullPath, { recursive: true });

    const files = await fs.readdir(sourcePath);

    for (const file of files) {
      const srcFile = path.join(sourcePath, file);
      const destFile = path.join(targetFullPath, file);

      const stat = await fs.stat(srcFile);

      if (stat.isDirectory()) {
        await this.addSkill(srcFile, path.join(targetPath, file));
      } else if (file !== 'SKILL.md' || !(await this.fileExists(destFile))) {
        await fs.copyFile(srcFile, destFile);
      }
    }
  }

  async createSkill(name: string, category: SkillCategory): Promise<string> {
    const skillPath = ensureWithin(this.config.source, category, name);

    await fs.mkdir(skillPath, { recursive: true });

    const skillMdPath = path.join(skillPath, 'SKILL.md');

    if (!(await this.fileExists(skillMdPath))) {
      const template = `# ${name}\n\n<!-- Add your skill content here -->\n`;
      await fs.writeFile(skillMdPath, template, 'utf8');
    }

    return skillPath;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
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
