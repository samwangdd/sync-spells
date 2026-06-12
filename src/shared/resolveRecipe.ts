import type { ProfileRecipe } from './contract';

type RecipeInput = Pick<ProfileRecipe, 'categories' | 'extras' | 'excludes' | 'skills'>;

/**
 * Mirrors scripts/materialize-profile.sh resolution: skills[] (raw) -> each
 * category expanded to its sorted refs (or raw category string if the category
 * key is absent) -> extras[]; then excludes removed and order-preserving dedup
 * by full ref. catalogByCategory keys MUST include every existing category
 * (even empty ones); values MUST already be sorted.
 */
export function resolveRecipe(
  recipe: RecipeInput,
  catalogByCategory: Record<string, string[]>,
): string[] {
  const refs: string[] = [];
  const pushTrimmed = (value: string): void => {
    const trimmed = value.trim();
    if (trimmed) refs.push(trimmed);
  };

  for (const ref of recipe.skills ?? []) pushTrimmed(ref);

  for (const category of recipe.categories ?? []) {
    const name = category.trim();
    if (!name) continue;
    if (Object.prototype.hasOwnProperty.call(catalogByCategory, name)) {
      for (const ref of catalogByCategory[name]) refs.push(ref);
    } else {
      refs.push(name);
    }
  }

  for (const ref of recipe.extras ?? []) pushTrimmed(ref);

  const excludes = new Set(
    (recipe.excludes ?? []).map((ref) => ref.trim()).filter(Boolean),
  );
  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const ref of refs) {
    if (excludes.has(ref) || seen.has(ref)) continue;
    seen.add(ref);
    resolved.push(ref);
  }
  return resolved;
}
