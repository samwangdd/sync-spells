import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../lib/config';
import { Profile } from '../types';
import { ProfileService } from '../services/ProfileService';
import { SkillService } from '../services/SkillService';
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
  private skillSvc: SkillService;

  constructor(private config: Config) {
    this.profileSvc = new ProfileService(config);
    this.skillSvc = new SkillService(config);
  }

  async buildCatalogByCategory(): Promise<Record<string, string[]>> {
    const skills = await this.skillSvc.listSkills();
    const catalog: Record<string, string[]> = {};
    for (const skill of skills) {
      (catalog[skill.category] ??= []).push(skill.path);
    }
    for (const category of Object.keys(catalog)) {
      catalog[category].sort();
    }
    return catalog;
  }

  async getState(): Promise<AppState> {
    const [profiles, skillInfos, catalog] = await Promise.all([
      this.profileSvc.listProfiles(),
      this.skillSvc.listSkills(),
      this.buildCatalogByCategory(),
    ]);
    const bindings = this.config.projectBindings ?? [];

    const profileViews = profiles.map((p) => buildProfileView(p, catalog, bindings));
    const resolvedByProfile = new Map(profileViews.map((v) => [v.name, new Set(v.resolvedRefs)]));

    const skills: SkillCard[] = await Promise.all(
      skillInfos.map(async (info): Promise<SkillCard> => {
        const fm = await this.readFrontmatter(info.path);
        const inProfiles = profileViews
          .filter((v) => resolvedByProfile.get(v.name)!.has(info.path))
          .map((v) => v.name);
        return {
          ref: info.path,
          name: info.name,
          category: info.category,
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

  private async readFrontmatter(ref: string) {
    try {
      const content = await fs.readFile(path.join(this.config.source, ref, 'SKILL.md'), 'utf8');
      return parseFrontmatter(content);
    } catch {
      return {}; // graceful: card shows name only
    }
  }
}
