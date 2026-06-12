import { describe, expect, test } from '@jest/globals';
import { createSceneDraft } from '../../webui/src/views/sceneDraft';
import type { ProfileView } from '../../src/shared/contract';

const profile = (name: string): ProfileView => ({
  name,
  categories: [],
  extras: [],
  excludes: [],
  skills: [],
  resolvedRefs: [],
  skillCount: 0,
  boundPaths: [],
});

describe('createSceneDraft', () => {
  test('creates an empty draft named new-scene when available', () => {
    expect(createSceneDraft([])).toEqual({
      name: 'new-scene',
      categories: [],
      extras: [],
      excludes: [],
      skills: [],
      boundPaths: [],
    });
  });

  test('chooses the next available new-scene name', () => {
    expect(createSceneDraft([profile('new-scene'), profile('new-scene-2')]).name).toBe('new-scene-3');
  });
});
