import type { ProfileView } from '../../../src/shared/contract';
import { createEmptyProfileDraft, type ProfileDraft } from '../../../src/shared/profileDraft';

export const createSceneDraft = (profiles: ProfileView[]): ProfileDraft => {
  const names = new Set(profiles.map((profile) => profile.name));
  const base = 'new-scene';

  if (!names.has(base)) {
    return { ...createEmptyProfileDraft(), name: base };
  }

  let index = 2;
  while (names.has(`${base}-${index}`)) {
    index += 1;
  }

  return { ...createEmptyProfileDraft(), name: `${base}-${index}` };
};
