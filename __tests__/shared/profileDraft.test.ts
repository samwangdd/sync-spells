import { describe, it, expect } from '@jest/globals';
import { createEmptyProfileDraft, profileToDraft } from '../../src/shared/profileDraft';
import type { ProfileView } from '../../src/shared/contract';

const profile: ProfileView = {
  name: 'mexc-code',
  categories: ['coding'],
  extras: ['workflow/task-run'],
  excludes: ['coding/scss'],
  skills: [],
  resolvedRefs: [],
  skillCount: 0,
  boundPaths: [],
};

describe('profileDraft', () => {
  it('creates an empty draft for a new scene', () => {
    expect(createEmptyProfileDraft()).toEqual({
      name: '',
      categories: [],
      extras: [],
      excludes: [],
      skills: [],
      boundPaths: [],
    });
  });

  it('copies editable fields from an existing profile', () => {
    expect(profileToDraft(profile)).toEqual({
      name: 'mexc-code',
      categories: ['coding'],
      extras: ['workflow/task-run'],
      excludes: ['coding/scss'],
      skills: [],
      boundPaths: [],
    });
  });

  it('copies bound paths into the editable draft', () => {
    expect(profileToDraft({ ...profile, boundPaths: ['/tmp/project'] }).boundPaths).toEqual(['/tmp/project']);
  });
});
