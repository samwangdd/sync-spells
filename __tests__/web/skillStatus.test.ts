import { describe, expect, test } from '@jest/globals';
import { isSkillActive } from '../../webui/src/skillStatus';

describe('isSkillActive', () => {
  test('is active when the skill appears in at least one scene', () => {
    expect(isSkillActive({ inProfiles: ['research'] })).toBe(true);
    expect(isSkillActive({ inProfiles: ['research', 'writing'] })).toBe(true);
  });

  test('is inactive when the skill appears in no scene', () => {
    expect(isSkillActive({ inProfiles: [] })).toBe(false);
  });
});
