import type { CategoryView } from '../../src/shared/contract';

export type QueryTab = 'scenes' | 'catalog';

export type ParsedUrlState = {
  tab: QueryTab;
  categorySlug: string | null;
};

export const slugCategory = (category: string): string =>
  category.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const parseCatalogUrlState = (search: string): ParsedUrlState => {
  const params = new URLSearchParams(search);
  const view = params.get('view');
  const category = params.get('category');

  return {
    tab: view === 'scenes' ? 'scenes' : 'catalog',
    categorySlug: category?.trim().toLowerCase() || null,
  };
};

export const resolveCategoryFromQuery = (categorySlug: string | null, categories: CategoryView[]): string => {
  if (!categorySlug) return 'all';
  if (categorySlug === 'all') return 'all';
  return categories.find((category) => slugCategory(category.name) === categorySlug)?.name ?? 'all';
};

export const buildCatalogUrlState = (tab: QueryTab, category: string): URLSearchParams => {
  const params = new URLSearchParams();
  if (tab === 'scenes') params.set('view', 'scenes');
  if (tab === 'catalog' && category !== 'all') params.set('category', slugCategory(category));
  return params;
};
