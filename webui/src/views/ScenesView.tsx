import React, { useMemo, useState } from 'react';
import type { AppState, ProfileRecipe } from '@shared/contract';
import { ProfileCard } from '../components/ProfileCard';
import { RecipeEditor } from '../components/RecipeEditor';
import { ResolvePreview } from '../components/ResolvePreview';
import { saveProfile } from '../api';

type Draft = Required<Pick<ProfileRecipe, 'name' | 'categories' | 'extras' | 'excludes' | 'skills'>>;

export const ScenesView: React.FC<{
  state: AppState; search: string; onSaved: () => void; onError: (msg: string) => void;
}> = ({ state, search, onSaved, onError }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const catalogByCategory = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const c of state.categories) map[c.name] = c.skillRefs;
    return map;
  }, [state.categories]);
  const allRefs = useMemo(() => state.skills.map((s) => s.ref).sort(), [state.skills]);
  const allCategories = useMemo(() => state.categories.map((c) => c.name), [state.categories]);

  const open = (name: string) => {
    const p = state.profiles.find((x) => x.name === name)!;
    setSelected(name);
    setDraft({ name: p.name, categories: [...p.categories], extras: [...p.extras], excludes: [...p.excludes], skills: [...p.skills] });
    setDirty(false);
  };

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.profiles.filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [state.profiles, search]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await saveProfile(draft.name, draft);
      setDirty(false);
      onSaved();
    } catch (e) {
      onError(String((e as Error).message || e));
    } finally {
      setSaving(false);
    }
  };

  if (!selected || !draft) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredProfiles.map((p) => <ProfileCard key={p.name} profile={p} onOpen={() => open(p.name)} />)}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => setSelected(null)} className="text-sm text-[var(--mx-muted)]">← 返回</button>
        <h2 className="text-xl font-semibold">{draft.name}</h2>
        {dirty && <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">未保存</span>}
        <button onClick={save} disabled={saving || !dirty}
          className="ml-auto rounded-full bg-[var(--mx-primary)] px-4 py-1.5 text-sm text-white disabled:opacity-40">
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecipeEditor
          categories={draft.categories} extras={draft.extras} excludes={draft.excludes}
          allCategories={allCategories} allRefs={allRefs}
          onChange={(patch) => { setDraft({ ...draft, ...patch }); setDirty(true); }}
        />
        <ResolvePreview recipe={draft} catalogByCategory={catalogByCategory} />
      </div>
    </div>
  );
};
