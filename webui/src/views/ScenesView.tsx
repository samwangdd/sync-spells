import React, { useMemo, useState } from 'react';
import type { AppState } from '@shared/contract';
import { profileToDraft, type ProfileDraft } from '@shared/profileDraft';
import { findSelectedProfile } from '@shared/profileSelection';
import { ProfileCard } from '../components/ProfileCard';
import { RecipeEditor } from '../components/RecipeEditor';
import { ResolvePreview } from '../components/ResolvePreview';
import { saveProfile } from '../api';
import { createSceneDraft } from './sceneDraft';

export const ScenesView: React.FC<{
  state: AppState; search: string; onSaved: () => void; onError: (msg: string) => void;
}> = ({ state, search, onSaved, onError }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const catalogByCategory = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const c of state.categories) map[c.name] = c.skillRefs;
    return map;
  }, [state.categories]);
  const allRefs = useMemo(() => state.skills.map((s) => s.ref).sort(), [state.skills]);
  const allCategories = useMemo(() => state.categories.map((c) => c.name), [state.categories]);
  const selectedProfile = useMemo(() => findSelectedProfile(state.profiles, selected), [state.profiles, selected]);

  const open = (name: string) => {
    const p = state.profiles.find((x) => x.name === name)!;
    setSelected(name);
    setDraft(profileToDraft(p));
    setDirty(false);
  };

  const createScene = () => {
    setSelected(null);
    setDraft(createSceneDraft(state.profiles));
    setDirty(true);
  };

  const goBack = () => {
    setSelected(null);
    setDraft(null);
  };

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.profiles.filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [state.profiles, search]);

  const save = async () => {
    if (!draft) return;
    const recipe = { ...draft, name: draft.name.trim() };
    setSaving(true);
    try {
      await saveProfile(recipe.name, recipe);
      setDraft(recipe);
      setDirty(false);
      setSelected(recipe.name);
      onSaved();
    } catch (e) {
      onError(String((e as Error).message || e));
    } finally {
      setSaving(false);
    }
  };

  const isNew = draft !== null && selectedProfile === null;
  const trimmedDraftName = draft?.name.trim() ?? '';
  const nameExists = isNew && state.profiles.some((p) => p.name === trimmedDraftName);
  const canSave = !!draft && dirty && !saving && trimmedDraftName.length > 0 && !nameExists;

  if (!draft) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredProfiles.map((p) => <ProfileCard key={p.name} profile={p} onOpen={() => open(p.name)} />)}
        <button onClick={createScene}
          className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-[var(--mx-radius)] border border-dashed border-[var(--mx-border)] bg-[var(--mx-surface)] p-5 text-center transition hover:border-[var(--mx-primary)] hover:text-[var(--mx-primary)]"
          style={{ boxShadow: 'var(--mx-shadow)' }}>
          <span className="text-2xl leading-none">+</span>
          <span className="text-sm font-medium">新增场景</span>
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="cursor-pointer text-[1.05rem] leading-none text-[var(--mx-muted)] hover:text-[var(--mx-primary)]"
        >
          ←
        </button>
        {isNew ? (
          <input
            value={draft.name}
            onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setDirty(true); }}
            placeholder="场景名称"
            className="mx-serif w-64 rounded border border-[var(--mx-border)] bg-[var(--mx-bg)] px-3 py-1.5 text-xl font-semibold outline-none focus:border-[var(--mx-primary)]"
          />
        ) : (
          <button
            type="button"
            onClick={goBack}
            className="mx-serif cursor-pointer text-left text-xl font-semibold hover:text-[var(--mx-primary)]"
          >
            {draft.name}
          </button>
        )}
        {dirty && <span className="rounded bg-[var(--mx-warning-soft)] px-2 py-0.5 text-xs text-[var(--mx-warning)]">未保存</span>}
        {nameExists && <span className="rounded bg-[var(--mx-danger-soft)] px-2 py-0.5 text-xs text-[var(--mx-danger)]">名称已存在</span>}
        <button onClick={save} disabled={!canSave}
          className="ml-auto rounded-full bg-[var(--mx-primary)] px-4 py-1.5 text-sm text-white disabled:opacity-40">
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecipeEditor
          categories={draft.categories} extras={draft.extras} excludes={draft.excludes} boundPaths={draft.boundPaths}
          allCategories={allCategories} allRefs={allRefs}
          onChange={(patch) => { setDraft({ ...draft, ...patch }); setDirty(true); }}
        />
        <ResolvePreview recipe={draft} catalogByCategory={catalogByCategory} />
      </div>
    </div>
  );
};
