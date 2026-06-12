import type { SkillCard } from './contract';

export const buildCategoryCounts = (skills: SkillCard[]): Map<string, number> => {
  const counts = new Map<string, number>([['all', skills.length]]);
  for (const skill of skills) {
    counts.set(skill.category, (counts.get(skill.category) ?? 0) + 1);
  }
  return counts;
};

export const formatCategoryFilterLabel = (category: string, counts: Map<string, number>): string =>
  `${category} (${counts.get(category) ?? 0})`;
