import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../lib/config';
import { backupPath } from '../lib/backup';
import { ProfileRecipeSchema, ProfileView } from '../shared/contract';
import { SkillCatalogService, buildProfileView } from './SkillCatalogService';

export class ProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileValidationError';
  }
}

export class ProfileWriter {
  private catalog: SkillCatalogService;

  constructor(private config: Config) {
    this.catalog = new SkillCatalogService(config);
  }

  async write(name: string, body: unknown): Promise<ProfileView> {
    const parsed = ProfileRecipeSchema.safeParse(body);
    if (!parsed.success) {
      throw new ProfileValidationError(`Invalid profile shape: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    }
    const recipe = parsed.data;

    const catalogByCategory = await this.catalog.buildCatalogByCategory();
    const knownCategories = new Set(Object.keys(catalogByCategory));
    const knownRefs = new Set(Object.values(catalogByCategory).flat());

    for (const category of recipe.categories ?? []) {
      if (!knownCategories.has(category.trim())) throw new ProfileValidationError(`Unknown category: ${category}`);
    }
    for (const ref of [...(recipe.skills ?? []), ...(recipe.extras ?? []), ...(recipe.excludes ?? [])]) {
      if (!knownRefs.has(ref.trim())) throw new ProfileValidationError(`Unknown skill ref: ${ref}`);
    }

    const profilesDir = this.config.profilesDir || path.join(this.config.source, 'profiles');
    const filePath = path.join(profilesDir, `${name}.json`);

    const existing = await this.readExisting(filePath);
    if (existing) await backupPath(filePath);

    const output: Record<string, unknown> = { ...existing, name: recipe.name };
    const setOrDelete = (key: 'categories' | 'extras' | 'excludes' | 'skills') => {
      const value = recipe[key];
      if (value && value.length > 0) output[key] = value;
      else delete output[key];
    };
    setOrDelete('categories');
    setOrDelete('extras');
    setOrDelete('excludes');
    setOrDelete('skills');

    await fs.mkdir(profilesDir, { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

    return buildProfileView(
      { name: recipe.name, categories: recipe.categories, extras: recipe.extras, skills: recipe.skills,
        ...({ excludes: recipe.excludes } as object) },
      catalogByCategory,
      this.config.projectBindings ?? [],
    );
  }

  private async readExisting(filePath: string): Promise<Record<string, unknown> | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}
