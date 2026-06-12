import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../lib/config';
import { Profile } from '../types';
import { ProfileService } from '../services/ProfileService';
import { resolveRecipe } from '../shared/resolveRecipe';
import { parseFrontmatter } from './frontmatter';
import { AppState, ProfileView, SkillCard, CategoryView } from '../shared/contract';

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

export class SkillCatalogService {
  private profileSvc: ProfileService;

  constructor(private config: Config) {
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
      .filter((name) => catalog[name].length > 0)
      .sort()
      .map((name) => ({ name, skillRefs: catalog[name] }));

    return { profiles: profileViews, skills, categories };
  }

  private async hasSkillMd(skillDir: string): Promise<boolean> {
    try {
      await fs.access(path.join(skillDir, 'SKILL.md'));
      return true;
    } catch {
      return false;
    }
  }

  private async readFrontmatter(ref: string) {
    try {
      const content = await fs.readFile(path.join(this.config.source, ref, 'SKILL.md'), 'utf8');
      return parseFrontmatter(content);
    } catch {
      return {}; // graceful: card shows name only
    }
  }
}
