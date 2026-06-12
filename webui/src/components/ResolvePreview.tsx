import React, { useMemo } from 'react';
import { resolveRecipe } from '@shared/resolveRecipe';
import type { ProfileRecipe } from '@shared/contract';

export const ResolvePreview: React.FC<{
  recipe: Pick<ProfileRecipe, 'categories' | 'extras' | 'excludes' | 'skills'>;
  catalogByCategory: Record<string, string[]>;
}> = ({ recipe, catalogByCategory }) => {
  const resolved = useMemo(() => resolveRecipe(recipe, catalogByCategory), [recipe, catalogByCategory]);
  const grouped = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const ref of resolved) {
      const cat = ref.includes('/') ? ref.split('/')[0] : '(raw)';
      (map.get(cat) ?? map.set(cat, []).get(cat)!).push(ref);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [resolved]);

  return (
    <div>
      <p className="mb-3 text-sm text-[var(--mx-muted)]">解析后生效 {resolved.length} 个 skill</p>
      {grouped.map(([cat, refs]) => (
        <section key={cat} className="mb-4">
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--mx-muted)]">{cat}</h4>
          <div className="flex flex-wrap gap-1.5">
            {refs.map((ref) => (
              <span key={ref} className="rounded bg-[var(--mx-surface)] px-2 py-1 text-xs border border-[var(--mx-border)]">
                {ref.includes('/') ? ref.split('/').slice(1).join('/') : ref}
              </span>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
