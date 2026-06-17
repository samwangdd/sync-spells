import React, { useMemo, useState } from 'react';
import type { AppState } from '@shared/contract';
import { profileToDraft, type ProfileDraft } from '@shared/profileDraft';
import { findSelectedProfile } from '@shared/profileSelection';
import { ProfileCard } from '../components/ProfileCard';
import { RecipeEditor } from '../components/RecipeEditor';
import { ResolvePreview } from '../components/ResolvePreview';
import { ViewHeader } from '../components/ViewHeader';
import { PlusIcon } from '../components/icons';
import { saveProfile } from '../api';
import { createSceneDraft } from './sceneDraft';

export const ScenesView: React.FC<{
  state: AppState;
  search: string;
  onSearch: (value: string) => void;
  searchRef?: React.Ref<HTMLInputElement>;
  subtitle?: string;
  onSaved: () => void;
  onError: (msg: string) => void;
}> = ({ state, search, onSearch, searchRef, subtitle, onSaved, onError }) => {
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
    const newButton = (
      <button
        type="button"
        onClick={createScene}
        className="flex h-[38px] items-center gap-1.5 rounded-[var(--radius-s)] bg-[var(--accent)] px-3.5 text-[13px] font-semibold text-[var(--accent-fg)] transition hover:opacity-90"
      >
        <PlusIcon size={15} />
        新增场景
      </button>
    );
    return (
      <div>
        <ViewHeader
          title="场景"
          count={state.profiles.length}
          subtitle={subtitle}
          search={search}
          onSearch={onSearch}
          searchRef={searchRef}
          action={newButton}
        />
        <div className="grid grid-cols-1 gap-3 px-[30px] pb-10 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProfiles.map((p) => <ProfileCard key={p.name} profile={p} onOpen={() => open(p.name)} />)}
          <button onClick={createScene}
            className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--panel)] p-5 text-center transition hover:border-[var(--accent)] hover:text-[var(--accent)]">
            <PlusIcon size={22} />
            <span className="text-sm font-medium">新增场景</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-[30px] py-6">
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="cursor-pointer text-[1.05rem] leading-none text-[var(--fg-dim)] hover:text-[var(--accent)]"
        >
          ←
        </button>
        {isNew ? (
          <input
            value={draft.name}
            onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setDirty(true); }}
            placeholder="场景名称"
            className="w-64 rounded-[var(--radius-s)] border border-[var(--border)] bg-[var(--code)] px-3 py-1.5 text-xl font-semibold outline-none focus:border-[var(--accent)]"
          />
        ) : (
          <button
            type="button"
            onClick={goBack}
            className="cursor-pointer text-left text-xl font-semibold hover:text-[var(--accent)]"
          >
            {draft.name}
          </button>
        )}
        {dirty && <span className="rounded-[var(--radius-s)] bg-[var(--warning-soft)] px-2 py-0.5 text-xs text-[var(--warning)]">未保存</span>}
        {nameExists && <span className="rounded-[var(--radius-s)] bg-[var(--danger-soft)] px-2 py-0.5 text-xs text-[var(--danger)]">名称已存在</span>}
        <button onClick={save} disabled={!canSave}
          className="ml-auto rounded-[var(--radius-s)] bg-[var(--accent)] px-4 py-1.5 text-sm text-[var(--accent-fg)] disabled:opacity-40">
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
