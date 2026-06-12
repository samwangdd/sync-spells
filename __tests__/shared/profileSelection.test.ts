import { describe, it, expect } from '@jest/globals';
import { findSelectedProfile } from '../../src/shared/profileSelection';
import type { ProfileView } from '../../src/shared/contract';

const profile = (name: string, boundPaths: string[]): ProfileView => ({
  name,
  categories: [],
  extras: [],
  excludes: [],
  skills: [],
  resolvedRefs: [],
  skillCount: 0,
  boundPaths,
});

describe('profileSelection', () => {
  it('returns the selected profile with bound paths intact', () => {
    const selected = findSelectedProfile([
      profile('global', []),
      profile('mexc-code', ['/Users/sammore/worktree']),
    ], 'mexc-code');

    expect(selected?.boundPaths).toEqual(['/Users/sammore/worktree']);
  });
});
