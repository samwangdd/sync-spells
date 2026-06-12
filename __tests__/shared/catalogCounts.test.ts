import { describe, it, expect } from '@jest/globals';
import { buildCategoryCounts, formatCategoryFilterLabel } from '../../src/shared/catalogCounts';
import type { SkillCard } from '../../src/shared/contract';

const skill = (ref: string, category: string): SkillCard => ({
  ref,
  category,
  name: ref.split('/')[1],
  inProfiles: [],
});

describe('catalogCounts', () => {
  it('counts all skills and each category', () => {
    const counts = buildCategoryCounts([
      skill('coding/git-commit', 'coding'),
      skill('coding/scss', 'coding'),
      skill('workflow/jira-handoff', 'workflow'),
    ]);

    expect(counts.get('all')).toBe(3);
    expect(counts.get('coding')).toBe(2);
    expect(counts.get('workflow')).toBe(1);
  });

  it('formats category filter labels with counts', () => {
    const counts = new Map([
      ['all', 3],
      ['coding', 2],
    ]);

    expect(formatCategoryFilterLabel('all', counts)).toBe('all (3)');
    expect(formatCategoryFilterLabel('coding', counts)).toBe('coding (2)');
    expect(formatCategoryFilterLabel('missing', counts)).toBe('missing (0)');
  });
});
