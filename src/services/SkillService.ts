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
    const categories = category
      ? [category]
      : await this.listCategories(registryDir);

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
        await this.scanSkillDirectory(skillPath, category, skills);
      }
    }
  }

  private async listCategories(registryDir: string): Promise<SkillCategory[]> {
    const preferred = ['global', 'coding', 'collaboration', 'workflow', 'external', 'inbox'];
    const entries = await fs.readdir(registryDir, { withFileTypes: true }).catch(() => []);
    const found = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter(name => !name.startsWith('.'));

    const ordered = preferred.filter(name => found.includes(name));
    const rest = found.filter(name => !preferred.includes(name)).sort();

    return [...ordered, ...rest];
  }

  private async scanSkillDirectory(
    dir: string,
    category: SkillCategory,
    skills: SkillInfo[]
  ): Promise<void> {
    const hasSkillMd = await this.checkSkillMd(dir);
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    const childDirs = entries.filter(entry => entry.isDirectory());

    if (hasSkillMd || childDirs.length === 0) {
      skills.push({
        path: path.relative(this.config.source, dir),
        category,
        name: path.basename(dir),
        hasSkillMd
      });
      return;
    }

    for (const entry of childDirs) {
      await this.scanSkillDirectory(path.join(dir, entry.name), category, skills);
    }
  }

  async globalizeSkill(skillPathOrName: string): Promise<{
    from: string;
    to: string;
    updatedProfiles: string[];
  }> {
    const from = await this.resolveSkillPath(skillPathOrName);
    const skillName = path.basename(from);
    const to = `global/${skillName}`;
    const sourcePath = ensureWithin(this.config.source, from);
    const targetPath = ensureWithin(this.config.source, to);

    if (from === to) {
      return { from, to, updatedProfiles: [] };
    }

    if (await this.fileExists(targetPath)) {
      throw new Error(`Global skill already exists: ${to}`);
    }

    const updates = await this.prepareProfileReferenceUpdates(from, to);

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.rename(sourcePath, targetPath);

    const updatedProfiles: string[] = [];
    for (const update of updates) {
      await fs.writeFile(update.filePath, update.content, 'utf8');
      updatedProfiles.push(update.filePath);
    }

    return { from, to, updatedProfiles };
  }

  private async resolveSkillPath(skillPathOrName: string): Promise<string> {
    const normalized = skillPathOrName.replace(/^\/+|\/+$/g, '');
    if (!normalized || normalized.includes('..')) {
      throw new Error(`Invalid skill path: ${skillPathOrName}`);
    }

    if (normalized.includes('/')) {
      const fullPath = ensureWithin(this.config.source, normalized);
      if (!(await this.fileExists(fullPath))) {
        throw new Error(`Skill not found: ${normalized}`);
      }
      const knownSkill = (await this.listSkills()).some(skill => skill.path === normalized);
      if (!knownSkill) {
        throw new Error(`Skill not found: ${normalized}`);
      }
      return normalized;
    }

    const matches = (await this.listSkills())
      .filter(skill => skill.name === normalized)
      .map(skill => skill.path);

    if (matches.length === 0) {
      throw new Error(`Skill not found: ${normalized}`);
    }

    if (matches.length > 1) {
      throw new Error(`Ambiguous skill name: ${normalized}\nCandidates:\n  ${matches.join('\n  ')}`);
    }

    return matches[0];
  }

  private async prepareProfileReferenceUpdates(
    from: string,
    to: string
  ): Promise<{ filePath: string; content: string }[]> {
    const profilesDir = this.config.profilesDir || path.join(this.config.source, 'profiles');
    const entries = await fs.readdir(profilesDir, { withFileTypes: true }).catch(() => []);
    const updates: { filePath: string; content: string }[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue;
      }

      const filePath = path.join(profilesDir, entry.name);
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as { skills?: unknown };

      if (!Array.isArray(parsed.skills)) {
        continue;
      }

      let changed = false;
      parsed.skills = parsed.skills.map(skill => {
        if (skill === from) {
          changed = true;
          return to;
        }
        return skill;
      });

      if (changed) {
        updates.push({
          filePath,
          content: `${JSON.stringify(parsed, null, 2)}\n`
        });
      }
    }

    return updates;
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
