import { describe, expect, test } from '@jest/globals';
import type { SkillCard } from '../../src/shared/contract';
import { moveSelectedSkillsToCategory, skillsMovableToCategory, toggleSelectedRef } from '../../webui/src/views/bulkSkillSelection';

const skill = (ref: string, category: string): SkillCard => ({
  ref,
  name: ref.split('/')[1],
  category,
  inProfiles: [],
});

describe('bulkSkillSelection', () => {
  test('toggleSelectedRef adds and removes a ref without mutating the input set', () => {
    const selected = new Set(['coding/a']);

    const added = toggleSelectedRef(selected, 'coding/b');
    const removed = toggleSelectedRef(added, 'coding/a');

    expect([...selected]).toEqual(['coding/a']);
    expect([...added].sort()).toEqual(['coding/a', 'coding/b']);
    expect([...removed]).toEqual(['coding/b']);
  });

  test('skillsMovableToCategory returns only selected skills outside the target category', () => {
    const skills = [skill('coding/a', 'coding'), skill('workflow/b', 'workflow'), skill('inbox/c', 'inbox')];

    expect(skillsMovableToCategory(skills, new Set(['coding/a', 'workflow/b', 'missing/x']), 'workflow')).toEqual([
      skills[0],
    ]);
  });

  test('moveSelectedSkillsToCategory moves selected skills sequentially', async () => {
    const skills = [skill('coding/a', 'coding'), skill('workflow/b', 'workflow')];
    const calls: Array<[string, string, string]> = [];
    const move = async (category: string, name: string, targetCategory: string) => {
      calls.push([category, name, targetCategory]);
    };

    await moveSelectedSkillsToCategory(skills, new Set(['coding/a', 'workflow/b']), 'inbox', move);

    expect(calls).toEqual([
      ['coding', 'a', 'inbox'],
      ['workflow', 'b', 'inbox'],
    ]);
  });
});
