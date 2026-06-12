import type { SkillCard } from '../../../src/shared/contract';

export const toggleSelectedRef = (selectedRefs: Set<string>, ref: string): Set<string> => {
  const next = new Set(selectedRefs);
  if (next.has(ref)) {
    next.delete(ref);
  } else {
    next.add(ref);
  }
  return next;
};

export const skillsMovableToCategory = (
  skills: SkillCard[],
  selectedRefs: Set<string>,
  targetCategory: string,
): SkillCard[] => skills.filter((skill) => selectedRefs.has(skill.ref) && skill.category !== targetCategory);

export const moveSelectedSkillsToCategory = async (
  skills: SkillCard[],
  selectedRefs: Set<string>,
  targetCategory: string,
  move: (category: string, skill: string, targetCategory: string) => Promise<unknown>,
): Promise<void> => {
  for (const skill of skillsMovableToCategory(skills, selectedRefs, targetCategory)) {
    await move(skill.category, skill.name, targetCategory);
  }
};
