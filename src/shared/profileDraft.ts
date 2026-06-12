import type { ProfileRecipe, ProfileView } from './contract';

export type ProfileDraft = Required<Pick<ProfileRecipe, 'name' | 'categories' | 'extras' | 'excludes' | 'skills' | 'boundPaths'>>;

export const createEmptyProfileDraft = (): ProfileDraft => ({
  name: '',
  categories: [],
  extras: [],
  excludes: [],
  skills: [],
  boundPaths: [],
});

export const profileToDraft = (profile: ProfileView): ProfileDraft => ({
  name: profile.name,
  categories: [...profile.categories],
  extras: [...profile.extras],
  excludes: [...profile.excludes],
  skills: [...profile.skills],
  boundPaths: [...profile.boundPaths],
});
