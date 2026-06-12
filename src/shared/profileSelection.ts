import type { ProfileView } from './contract';

export const findSelectedProfile = (
  profiles: ProfileView[],
  selected: string | null,
): ProfileView | null =>
  selected ? profiles.find((profile) => profile.name === selected) ?? null : null;
