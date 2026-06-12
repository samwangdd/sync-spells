import {
  AppStateSchema, CategoryViewSchema, ProfileViewSchema, SkillMarkdownSchema, RemoveSkillResultSchema,
  type AppState, type CategoryView, type ProfileRecipe, type ProfileView, type SkillMarkdown, type RemoveSkillResult,
} from '@shared/contract';

const json = async (res: Response): Promise<unknown> => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { error?: string }).error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
};

export const fetchState = async (): Promise<AppState> =>
  AppStateSchema.parse(await json(await fetch('/api/state')));

export const saveProfile = async (name: string, recipe: ProfileRecipe): Promise<ProfileView> =>
  ProfileViewSchema.parse(
    await json(
      await fetch(`/api/profiles/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipe),
      }),
    ),
  );

export const fetchMarkdown = async (ref: string): Promise<SkillMarkdown> =>
  SkillMarkdownSchema.parse(
    await json(await fetch(`/api/skill/${encodeURIComponent(ref)}/markdown`)),
  );

export const removeSkillFromCategory = async (category: string, skill: string): Promise<RemoveSkillResult> =>
  RemoveSkillResultSchema.parse(
    await json(
      await fetch(`/api/categories/${encodeURIComponent(category)}/skills/${encodeURIComponent(skill)}`, {
        method: 'DELETE',
      }),
    ),
  );

export const moveSkillToCategory = async (
  category: string,
  skill: string,
  targetCategory: string,
): Promise<RemoveSkillResult> =>
  RemoveSkillResultSchema.parse(
    await json(
      await fetch(`/api/categories/${encodeURIComponent(category)}/skills/${encodeURIComponent(skill)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetCategory }),
      }),
    ),
  );

export const createCategory = async (name: string): Promise<CategoryView> =>
  CategoryViewSchema.parse(
    await json(
      await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    ),
  );
