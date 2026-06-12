import { describe, expect, test } from '@jest/globals';
import { shouldCloseSkillCardMenu } from '../../webui/src/components/skillCardMenu';

const node = (containsResult: boolean) => ({
  contains: () => containsResult,
});

describe('shouldCloseSkillCardMenu', () => {
  test('closes when clicking outside the menu root', () => {
    expect(shouldCloseSkillCardMenu(node(false), {})).toBe(true);
  });

  test('stays open when clicking inside the menu root', () => {
    expect(shouldCloseSkillCardMenu(node(true), {})).toBe(false);
  });

  test('ignores events without a concrete target', () => {
    expect(shouldCloseSkillCardMenu(node(false), null)).toBe(false);
  });
});
