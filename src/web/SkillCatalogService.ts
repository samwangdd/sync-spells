import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../lib/config';
import { Profile } from '../types';
import { ProfileService } from '../services/ProfileService';
import { resolveRecipe } from '../shared/resolveRecipe';
import { parseFrontmatter } from './frontmatter';
import { AppState, ProfileView, SkillCard, CategoryView, RemoveSkillResult } from '../shared/contract';

export const buildProfileView = (
  profile: Profile,
  catalogByCategory: Record<string, string[]>,
  projectBindings: { path: string; profile: string }[],
): ProfileView => {
  const recipe = {
    skills: profile.skills ?? [],
    categories: profile.categories ?? [],
    extras: profile.extras ?? [],
    excludes: (profile as { excludes?: string[] }).excludes ?? [],
  };
  const resolvedRefs = resolveRecipe(recipe, catalogByCategory);
  return {
    name: profile.name,
    categories: recipe.categories,
    extras: recipe.extras,
    excludes: recipe.excludes,
    skills: recipe.skills,
    resolvedRefs,
    skillCount: resolvedRefs.length,
    boundPaths: projectBindings.filter((b) => b.profile === profile.name).map((b) => b.path),
  };
};

/**
 * A single unreadable SKILL.md must never stall the whole catalog. iCloud can evict file
 * content locally (`dataless`): metadata stays (so `stat` is cheap and non-blocking), but
 * reading the content blocks a libuv threadpool thread on an on-demand download that may
 * never arrive. Because `Promise.all` fans out one read per skill and the default threadpool
 * is only 4 threads, a couple of stuck reads exhaust the pool and wedge every later request —
 * a read timeout does NOT help, since aborting can't interrupt a syscall already in the kernel.
 * So we stat-first and skip files that aren't materialized locally, degrading them to
 * name-only, exactly like a missing frontmatter — never dispatching a read that could block.
 */
export interface SkillCatalogOptions {
  /** Injectable stat (tests simulate a dataless file: size>0, blocks=0). */
  stat?: (filePath: string) => Promise<{ size: number; blocks: number }>;
  /** Injectable SKILL.md reader (tests assert a dataless file is never read). */
  readSkillMd?: (filePath: string) => Promise<string>;
}

export class SkillCatalogService {
  private profileSvc: ProfileService;

  constructor(private config: Config, private opts: SkillCatalogOptions = {}) {
    this.profileSvc = new ProfileService(config);
  }

  /**
   * Materialize-faithful catalog: a "skill" is a depth-1 directory `<category>/<skill>`
   * that contains a SKILL.md, mirroring the depth-1 `<category>/<skill>/SKILL.md` layout
   * scanned by scripts/materialize-profile.sh. Nested reference dirs and SKILL.md-less
   * directories are NOT skills, so they never leak into category resolution. Every existing
   * category directory under `source` (except the profiles directory) gets a key — possibly
   * empty — so resolveRecipe can distinguish an existing-but-empty category from an unknown one.
   */
  async buildCatalogByCategory(): Promise<Record<string, string[]>> {
    const profilesDir = path.resolve(this.config.profilesDir || path.join(this.config.source, 'profiles'));
    const entries = await fs.readdir(this.config.source, { withFileTypes: true }).catch(() => []);
    const catalog: Record<string, string[]> = {};

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const categoryDir = path.join(this.config.source, entry.name);
      if (path.resolve(categoryDir) === profilesDir) continue; // the profiles folder is not a category

      const children = await fs.readdir(categoryDir, { withFileTypes: true }).catch(() => []);
      const refs: string[] = [];
      for (const child of children) {
        if (!child.isDirectory()) continue;
        if (await this.hasSkillMd(path.join(categoryDir, child.name))) {
          refs.push(`${entry.name}/${child.name}`);
        }
      }
      catalog[entry.name] = refs.sort();
    }
    return catalog;
  }

  async getState(): Promise<AppState> {
    const [profiles, catalog] = await Promise.all([
      this.profileSvc.listProfiles(),
      this.buildCatalogByCategory(),
    ]);
    const bindings = this.config.projectBindings ?? [];

    const profileViews = profiles.map((p) => buildProfileView(p, catalog, bindings));
    const resolvedByProfile = new Map(profileViews.map((v) => [v.name, new Set(v.resolvedRefs)]));

    const allRefs = Object.values(catalog).flat();
    const skills: SkillCard[] = await Promise.all(
      allRefs.map(async (ref): Promise<SkillCard> => {
        const fm = await this.readFrontmatter(ref);
        const inProfiles = profileViews
          .filter((v) => resolvedByProfile.get(v.name)!.has(ref))
          .map((v) => v.name);
        return {
          ref,
          name: path.basename(ref),
          category: ref.split('/')[0],
          description: fm.description,
          version: fm.version,
          requiresBins: fm.requiresBins,
          inProfiles,
        };
      }),
    );

    const categories: CategoryView[] = Object.keys(catalog)
      .sort()
      .map((name) => ({ name, skillRefs: catalog[name] }));

    return { profiles: profileViews, skills, categories };
  }

  async removeSkillFromCategory(category: string, skill: string): Promise<RemoveSkillResult> {
    return this.moveSkillToCategory(category, skill, 'inbox');
  }

  async createCategory(name: string): Promise<CategoryView> {
    const category = name.trim();
    this.assertDepthOneName(category, 'category');

    const categoryDir = path.join(this.config.source, category);
    if (await this.pathExists(categoryDir)) {
      throw new Error(`Category already exists: ${category}`);
    }

    await fs.mkdir(categoryDir, { recursive: true });
    return { name: category, skillRefs: [] };
  }

  async moveSkillToCategory(category: string, skill: string, targetCategory: string): Promise<RemoveSkillResult> {
    this.assertDepthOneName(category, 'category');
    this.assertDepthOneName(skill, 'skill');
    this.assertDepthOneName(targetCategory, 'target category');

    const sourceDir = path.join(this.config.source, category, skill);
    if (!(await this.hasSkillMd(sourceDir))) {
      throw new Error(`Skill not found: ${category}/${skill}`);
    }

    const targetCategoryDir = path.join(this.config.source, targetCategory);
    const targetDir = path.join(targetCategoryDir, skill);
    if (path.resolve(sourceDir) === path.resolve(targetDir)) {
      throw new Error(`Skill is already in ${targetCategory}: ${skill}`);
    }
    if (await this.pathExists(targetDir)) {
      throw new Error(`Target already exists: ${targetCategory}/${skill}`);
    }

    await fs.mkdir(targetCategoryDir, { recursive: true });
    await fs.rename(sourceDir, targetDir);

    return {
      removedRef: `${category}/${skill}`,
      movedTo: `${targetCategory}/${skill}`,
    };
  }

  private async hasSkillMd(skillDir: string): Promise<boolean> {
    try {
      await fs.access(path.join(skillDir, 'SKILL.md'));
      return true;
    } catch {
      return false;
    }
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private assertDepthOneName(value: string, label: string): void {
    if (!value || value.includes('/') || value.includes('\\') || value === '.' || value === '..') {
      throw new Error(`Invalid ${label}: ${value}`);
    }
  }

  private async readFrontmatter(ref: string) {
    const filePath = path.join(this.config.source, ref, 'SKILL.md');
    try {
      const stat = this.opts.stat ? await this.opts.stat(filePath) : await fs.stat(filePath);
      // Not materialized locally (iCloud-dataless): reading would block a threadpool thread. Skip.
      if (stat.size > 0 && stat.blocks === 0) return {};
      const content = this.opts.readSkillMd
        ? await this.opts.readSkillMd(filePath)
        : await fs.readFile(filePath, 'utf8');
      return parseFrontmatter(content);
    } catch {
      return {}; // graceful: card shows name only (missing, unreadable, or dataless file)
    }
  }
}
