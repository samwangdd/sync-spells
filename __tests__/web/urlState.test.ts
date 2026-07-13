import { describe, expect, test } from '@jest/globals';
import type { CategoryView } from '../../src/shared/contract';
import {
  buildCatalogUrlState,
  parseCatalogUrlState,
  resolveCategoryFromQuery,
  slugCategory,
} from '../../webui/src/urlState';

const categories = (names: string[]): CategoryView[] => names.map((name) => ({ name, skillRefs: [] }));

describe('urlState', () => {
  test('catalog is the default tab, so only scenes is marked in the query', () => {
    expect(buildCatalogUrlState('catalog', 'PM').toString()).toBe('category=pm');
    expect(buildCatalogUrlState('scenes', 'all').toString()).toBe('view=scenes');
    expect(slugCategory('Agent Ops')).toBe('agent-ops');
  });

  test('parses selected tab and category from URL query', () => {
    expect(parseCatalogUrlState('?category=pm')).toEqual({ tab: 'catalog', categorySlug: 'pm' });
    expect(parseCatalogUrlState('?view=scenes')).toEqual({ tab: 'scenes', categorySlug: null });
  });

  test('resolves category slugs back to existing category names', () => {
    expect(resolveCategoryFromQuery('pm', categories(['Coding', 'PM', 'Agent Ops']))).toBe('PM');
    expect(resolveCategoryFromQuery('agent-ops', categories(['Coding', 'PM', 'Agent Ops']))).toBe('Agent Ops');
  });

  test('falls back to the default catalog tab for invalid query values', () => {
    expect(parseCatalogUrlState('?view=unknown&category=missing')).toEqual({ tab: 'catalog', categorySlug: 'missing' });
    expect(resolveCategoryFromQuery('missing', categories(['PM']))).toBe('all');
  });
});
