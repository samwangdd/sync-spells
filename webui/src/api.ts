import {
  AppStateSchema, ProfileViewSchema, SkillMarkdownSchema,
  type AppState, type ProfileRecipe, type ProfileView, type SkillMarkdown,
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
