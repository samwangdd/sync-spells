import React, { useState } from 'react';

const fieldCopy = {
  categories: {
    label: '分类',
    description: '选择要整体纳入这个场景的分类，分类里的所有 skill 都会参与解析。',
  },
  extras: {
    label: '额外 skill',
    description: '单独加入不在所选分类里的 skill，适合给当前场景补充特例。',
  },
  excludes: {
    label: '排除 skill',
    description: '从解析结果中移除指定 skill，用来覆盖分类里不适合当前场景的项。',
  },
  boundPaths: {
    label: '绑定路径',
    description: '这些项目路径会自动使用当前场景；路径下运行 spells use 时会命中它。',
  },
} as const;

type FieldKey = keyof typeof fieldCopy;

const ListEditor: React.FC<{ field: FieldKey; items: string[]; onChange: (next: string[]) => void; suggestions?: string[] }> =
  ({ field, items, onChange, suggestions }) => {
    const copy = fieldCopy[field];
    const [draft, setDraft] = useState('');
    const add = () => {
      const v = draft.trim();
      if (v && !items.includes(v)) onChange([...items, v]);
      setDraft('');
    };
    return (
      <div className="rounded-[var(--mx-radius)] border border-[var(--mx-border)] bg-[var(--mx-surface)] p-4">
        <h4 className="text-sm font-semibold">{copy.label}</h4>
        <p className="mb-3 mt-1 text-xs leading-5 text-[var(--mx-muted)]">{copy.description}</p>
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
          <input list={`sugg-${field}`} value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="新增…"
            className="flex-1 rounded border border-[var(--mx-border)] px-2 py-1 text-sm outline-none focus:border-[var(--mx-primary)]" />
          <button onClick={add} className="rounded bg-[var(--mx-primary)] px-3 py-1 text-sm text-white">添加</button>
          {suggestions && <datalist id={`sugg-${field}`}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
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
    <ListEditor field="categories" items={categories} suggestions={allCategories} onChange={(v) => onChange({ categories: v })} />
    <ListEditor field="extras" items={extras} suggestions={allRefs} onChange={(v) => onChange({ extras: v })} />
    <ListEditor field="excludes" items={excludes} suggestions={allRefs} onChange={(v) => onChange({ excludes: v })} />
    {boundPaths && <ListEditor field="boundPaths" items={boundPaths} onChange={(v) => onChange({ boundPaths: v })} />}
  </div>
);
