import React, { useMemo, useState } from 'react';
import type { AppState, SkillCard as SkillCardData } from '@shared/contract';
import { SkillCard } from '../components/SkillCard';
import { SkillDrawer } from '../components/SkillDrawer';

export const CatalogView: React.FC<{ state: AppState; search: string }> = ({ state, search }) => {
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.skills.filter((s) => {
      if (category !== 'all' && s.category !== category) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q);
    });
  }, [state.skills, search, category]);

  const byCategory = useMemo(() => {
    const map = new Map<string, SkillCardData[]>();
    for (const s of filtered) (map.get(s.category) ?? map.set(s.category, []).get(s.category)!).push(s);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const openSkill = state.skills.find((s) => s.ref === openRef) ?? null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {['all', ...state.categories.map((c) => c.name)].map((c) => (
          <button key={c} onClick={() => setCategory(c)}
            className={`rounded-full px-3 py-1 text-sm ${category === c ? 'bg-[var(--mx-primary)] text-white' : 'bg-[var(--mx-surface)] text-[var(--mx-muted)] border border-[var(--mx-border)]'}`}>
            {c}
          </button>
        ))}
      </div>
      {byCategory.map(([cat, skills]) => (
        <section key={cat} className="mb-8">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--mx-muted)]">{cat}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {skills.map((s) => <SkillCard key={s.ref} skill={s} onOpen={() => setOpenRef(s.ref)} />)}
          </div>
        </section>
      ))}
      {openSkill && <SkillDrawer skill={openSkill} onClose={() => setOpenRef(null)} />}
    </div>
  );
};
