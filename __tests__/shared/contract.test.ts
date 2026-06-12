import { describe, it, expect } from '@jest/globals';
import {
  ProfileRecipeSchema,
  SkillCardSchema,
  ProfileViewSchema,
  AppStateSchema,
} from '../../src/shared/contract';

describe('contract schemas', () => {
  it('ProfileRecipeSchema accepts a minimal recipe (name only)', () => {
    const r = ProfileRecipeSchema.parse({ name: 'mexc-code' });
    expect(r.name).toBe('mexc-code');
    expect(r.categories).toBeUndefined();
  });

  it('ProfileRecipeSchema rejects an empty name', () => {
    expect(ProfileRecipeSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('ProfileRecipeSchema rejects non-string array members', () => {
    expect(ProfileRecipeSchema.safeParse({ name: 'x', categories: [1] }).success).toBe(false);
  });

  it('SkillCardSchema requires inProfiles and ref', () => {
    const c = SkillCardSchema.parse({
      ref: 'coding/git-commit', name: 'git-commit', category: 'coding', inProfiles: ['all'],
    });
    expect(c.inProfiles).toEqual(['all']);
  });

  it('ProfileViewSchema parses a full view', () => {
    const v = ProfileViewSchema.parse({
      name: 'all', categories: ['coding'], extras: [], excludes: ['workflow/jira-handoff'],
      skills: [], resolvedRefs: ['coding/git-commit'], skillCount: 1, boundPaths: [],
    });
    expect(v.skillCount).toBe(1);
  });

  it('AppStateSchema parses an empty-ish state', () => {
    const s = AppStateSchema.parse({ profiles: [], skills: [], categories: [] });
    expect(s.profiles).toEqual([]);
  });
});
