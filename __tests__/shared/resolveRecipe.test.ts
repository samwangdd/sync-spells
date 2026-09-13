import { describe, it, expect } from '@jest/globals';
import { resolveRecipe } from '../../src/shared/resolveRecipe';

const catalog = {
  coding: ['coding/git-commit', 'coding/scss', 'coding/web-perf'],
  workflow: ['workflow/jira-handoff', 'workflow/task-run'],
  empty: [],
};

describe('resolveRecipe', () => {
  it('expands a category to its sorted refs', () => {
    expect(resolveRecipe({ categories: ['coding'] }, catalog))
      .toEqual(['coding/git-commit', 'coding/scss', 'coding/web-perf']);
  });

  it('appends extras after categories', () => {
    expect(resolveRecipe({ categories: ['coding'], extras: ['workflow/task-run'] }, catalog))
      .toEqual(['coding/git-commit', 'coding/scss', 'coding/web-perf', 'workflow/task-run']);
  });

  it('removes excluded refs', () => {
    expect(resolveRecipe({ categories: ['coding', 'workflow'], excludes: ['workflow/jira-handoff'] }, catalog))
      .toEqual(['coding/git-commit', 'coding/scss', 'coding/web-perf', 'workflow/task-run']);
  });

  it('removes dormant-excluded refs the same way as excludes', () => {
    expect(resolveRecipe(
      { categories: ['coding', 'workflow'], dormantExcludes: [{ skill: 'workflow/jira-handoff', since: '2026-09-01', window: 30, hits: 0 }] },
      catalog,
    )).toEqual(['coding/git-commit', 'coding/scss', 'coding/web-perf', 'workflow/task-run']);
  });

  it('unions excludes and dormantExcludes without double-removal side effects', () => {
    expect(resolveRecipe(
      {
        categories: ['coding', 'workflow'],
        excludes: ['workflow/jira-handoff'],
        dormantExcludes: [{ skill: 'coding/git-commit', since: '2026-09-01', window: 30, hits: 0 }],
      },
      catalog,
    )).toEqual(['coding/scss', 'coding/web-perf', 'workflow/task-run']);
  });

  it('puts raw skills[] first, in order', () => {
    expect(resolveRecipe({ skills: ['coding/web-perf'], categories: ['coding'] }, catalog))
      .toEqual(['coding/web-perf', 'coding/git-commit', 'coding/scss']);
  });

  it('dedups by full ref, preserving first position', () => {
    expect(resolveRecipe({ extras: ['coding/scss'], categories: ['coding'] }, catalog))
      .toEqual(['coding/git-commit', 'coding/scss', 'coding/web-perf']);
  });

  it('expands an existing-but-empty category to nothing (key present)', () => {
    expect(resolveRecipe({ categories: ['empty'], extras: ['workflow/task-run'] }, catalog))
      .toEqual(['workflow/task-run']);
  });

  it('appends the raw category string when the category is unknown', () => {
    expect(resolveRecipe({ categories: ['nope'] }, catalog)).toEqual(['nope']);
  });

  it('trims and drops empty entries in skills/extras/excludes', () => {
    expect(resolveRecipe({ extras: ['  coding/scss  ', '', '   '] }, catalog))
      .toEqual(['coding/scss']);
  });

  it('returns [] for an empty recipe', () => {
    expect(resolveRecipe({}, catalog)).toEqual([]);
  });
});
