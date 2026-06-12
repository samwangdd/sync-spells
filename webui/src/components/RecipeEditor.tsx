import React, { useState } from 'react';

const ListEditor: React.FC<{ title: string; items: string[]; onChange: (next: string[]) => void; suggestions?: string[] }> =
  ({ title, items, onChange, suggestions }) => {
    const [draft, setDraft] = useState('');
    const add = () => {
      const v = draft.trim();
      if (v && !items.includes(v)) onChange([...items, v]);
      setDraft('');
    };
    return (
      <div className="rounded-[var(--mx-radius)] border border-[var(--mx-border)] bg-[var(--mx-surface)] p-4">
        <h4 className="mb-2 text-sm font-semibold">{title}</h4>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {items.map((it) => (
            <span key={it} className="flex items-center gap-1 rounded bg-[var(--mx-bg)] px-2 py-0.5 text-xs">
              {it}
              <button onClick={() => onChange(items.filter((x) => x !== it))} className="text-[var(--mx-muted)]">✕</button>
            </span>
          ))}
          {items.length === 0 && <span className="text-xs text-[var(--mx-muted)]">（空）</span>}
        </div>
        <div className="flex gap-2">
          <input list={`sugg-${title}`} value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="新增…"
            className="flex-1 rounded border border-[var(--mx-border)] px-2 py-1 text-sm outline-none focus:border-[var(--mx-primary)]" />
          <button onClick={add} className="rounded bg-[var(--mx-primary)] px-3 py-1 text-sm text-white">+ Add</button>
          {suggestions && <datalist id={`sugg-${title}`}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
        </div>
      </div>
    );
  };

export const RecipeEditor: React.FC<{
  categories: string[]; extras: string[]; excludes: string[]; boundPaths?: string[];
  allCategories: string[]; allRefs: string[];
  onChange: (patch: { categories?: string[]; extras?: string[]; excludes?: string[]; boundPaths?: string[] }) => void;
}> = ({ categories, extras, excludes, boundPaths, allCategories, allRefs, onChange }) => (
  <div className="flex flex-col gap-3">
    <ListEditor title="categories" items={categories} suggestions={allCategories} onChange={(v) => onChange({ categories: v })} />
    <ListEditor title="extras" items={extras} suggestions={allRefs} onChange={(v) => onChange({ extras: v })} />
    <ListEditor title="excludes" items={excludes} suggestions={allRefs} onChange={(v) => onChange({ excludes: v })} />
    {boundPaths && <ListEditor title="bound paths" items={boundPaths} onChange={(v) => onChange({ boundPaths: v })} />}
  </div>
);
