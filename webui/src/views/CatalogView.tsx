import React, { useMemo, useState } from 'react';
import type { AppState, SkillCard as SkillCardData } from '@shared/contract';
import { buildCategoryCounts, formatCategoryFilterLabel } from '@shared/catalogCounts';
import { SkillRow, SKILL_GRID } from '../components/SkillRow';
import { SkillDrawer } from '../components/SkillDrawer';
import { ViewHeader } from '../components/ViewHeader';
import { PlusIcon } from '../components/icons';
import { createCategory, moveSkillToCategory, removeSkillFromCategory } from '../api';
import { moveSelectedSkillsToCategory, skillsMovableToCategory, toggleSelectedRef } from './bulkSkillSelection';

export const CatalogView: React.FC<{
  state: AppState;
  search: string;
  onSearch: (value: string) => void;
  searchRef?: React.Ref<HTMLInputElement>;
  subtitle?: string;
  category: string;
  onCategoryChange: (category: string) => void;
  onSaved: () => void;
  onError: (message: string | null) => void;
}> = ({ state, search, onSearch, searchRef, subtitle, category, onCategoryChange, onSaved, onError }) => {
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [removingRef, setRemovingRef] = useState<string | null>(null);
  const [moveSkill, setMoveSkill] = useState<SkillCardData | null>(null);
  const [targetCategory, setTargetCategory] = useState<string>('');
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(() => new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkTargetCategory, setBulkTargetCategory] = useState('');
  const [isBulkMoving, setIsBulkMoving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.skills.filter((s) => {
      if (category !== 'all' && s.category !== category) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q);
    });
  }, [state.skills, search, category]);

  const categoryCounts = useMemo(() => buildCategoryCounts(state.skills), [state.skills]);
  const scopeTotal = useMemo(
    () => (category === 'all' ? state.skills.length : state.skills.filter((s) => s.category === category).length),
    [state.skills, category],
  );

  const openSkill = state.skills.find((s) => s.ref === openRef) ?? null;
  const selectedSkills = useMemo(
    () => state.skills.filter((skill) => selectedRefs.has(skill.ref)),
    [state.skills, selectedRefs],
  );
  const bulkMoveTargets = useMemo(
    () => state.categories.map((c) => c.name).filter((name) => selectedSkills.some((skill) => skill.category !== name)),
    [state.categories, selectedSkills],
  );

  const toggleSkillSelection = (ref: string) => setSelectedRefs((current) => toggleSelectedRef(current, ref));
  const clearSelection = () => setSelectedRefs(new Set());

  const removeSkill = async (skill: SkillCardData) => {
    if (!window.confirm(`把 ${skill.ref} 从当前分类移到 inbox？`)) return;
    setRemovingRef(skill.ref);
    onError(null);
    try {
      await removeSkillFromCategory(skill.category, skill.name);
      if (openRef === skill.ref) setOpenRef(null);
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemovingRef(null);
    }
  };

  const moveTargets = useMemo(
    () => state.categories.map((c) => c.name).filter((name) => name !== moveSkill?.category),
    [state.categories, moveSkill],
  );

  const openMoveDialog = (skill: SkillCardData) => {
    const targets = state.categories.map((c) => c.name).filter((name) => name !== skill.category);
    setMoveSkill(skill);
    setTargetCategory(targets[0] ?? '');
  };

  const submitMove = async () => {
    if (!moveSkill || !targetCategory) return;
    setRemovingRef(moveSkill.ref);
    onError(null);
    try {
      await moveSkillToCategory(moveSkill.category, moveSkill.name, targetCategory);
      if (openRef === moveSkill.ref) setOpenRef(null);
      setMoveSkill(null);
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemovingRef(null);
    }
  };

  const openBulkMoveDialog = () => {
    setBulkTargetCategory(bulkMoveTargets[0] ?? '');
    setBulkMoveOpen(true);
  };

  const submitBulkMove = async () => {
    if (!bulkTargetCategory || selectedRefs.size === 0) return;
    setIsBulkMoving(true);
    onError(null);
    try {
      await moveSelectedSkillsToCategory(state.skills, selectedRefs, bulkTargetCategory, moveSkillToCategory);
      if (openSkill && selectedRefs.has(openSkill.ref)) setOpenRef(null);
      setBulkMoveOpen(false);
      clearSelection();
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBulkMoving(false);
    }
  };

  const addCategory = async () => {
    const name = window.prompt('分类名称');
    const categoryName = name?.trim();
    if (!categoryName) return;
    onError(null);
    try {
      await createCategory(categoryName);
      onCategoryChange(categoryName);
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const newButton = (
    <button
      type="button"
      onClick={addCategory}
      className="flex h-[38px] items-center gap-1.5 rounded-[var(--radius-s)] bg-[var(--accent)] px-3.5 text-[13px] font-semibold text-[var(--accent-fg)] transition hover:opacity-90"
    >
      <PlusIcon size={15} />
      新增分类
    </button>
  );

  return (
    <div>
      <ViewHeader
        title="分类"
        count={state.skills.length}
        subtitle={subtitle}
        search={search}
        onSearch={onSearch}
        searchRef={searchRef}
        action={newButton}
      />

      <div className="px-[30px] pb-10">
        {/* filter chips */}
        <div className="mb-4 flex flex-wrap items-center gap-[7px]">
          {['all', ...state.categories.map((c) => c.name)].map((c) => (
            <button
              key={c}
              onClick={() => onCategoryChange(c)}
              className={`rounded-[var(--radius-s)] px-3 py-1 text-[12.5px] transition ${
                category === c
                  ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                  : 'border border-[var(--border)] text-[var(--fg-dim)] hover:border-[var(--border-strong)]'
              }`}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {c === 'all' ? `all · ${state.skills.length}` : formatCategoryFilterLabel(c, categoryCounts)}
            </button>
          ))}
          <span className="ml-auto text-[11.5px] text-[var(--fg-mute)]" style={{ fontFamily: 'var(--font-mono)' }}>
            — {filtered.length} / {scopeTotal} —
          </span>
        </div>

        {/* bulk-select bar */}
        {selectedRefs.size > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--panel)] px-3 py-2">
            <span className="text-[13px] font-medium">已选择 {selectedRefs.size} 个 skill</span>
            <button
              type="button"
              onClick={openBulkMoveDialog}
              disabled={bulkMoveTargets.length === 0}
              className="rounded-[var(--radius-s)] bg-[var(--accent)] px-3 py-1.5 text-[12.5px] text-[var(--accent-fg)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              批量移动到分类
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-[var(--radius-s)] border border-[var(--border)] px-3 py-1.5 text-[12.5px] text-[var(--fg-dim)] hover:bg-[var(--code)]"
            >
              清除选择
            </button>
          </div>
        )}

        {/* skills table */}
        <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--panel)]">
          <div
            className="grid items-center bg-[var(--code)] px-4 py-[11px] text-[10.5px] uppercase tracking-wide text-[var(--fg-mute)]"
            style={{ gridTemplateColumns: SKILL_GRID, columnGap: 14, fontFamily: 'var(--font-mono)' }}
          >
            <span />
            <span />
            <span>name</span>
            <span>category</span>
            <span>tools</span>
            <span>version</span>
            <span className="text-right">scenes</span>
            <span />
          </div>
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12.5px] text-[var(--fg-mute)]" style={{ fontFamily: 'var(--font-mono)' }}>
              没有匹配的 skill{search.trim() ? ` — ${search.trim()}` : ''}
            </p>
          ) : (
            filtered.map((s) => (
              <SkillRow
                key={s.ref}
                skill={s}
                onOpen={() => setOpenRef(s.ref)}
                onRemove={() => removeSkill(s)}
                onMoveTo={() => openMoveDialog(s)}
                isRemoving={removingRef === s.ref}
                isSelected={selectedRefs.has(s.ref)}
                onToggleSelected={() => toggleSkillSelection(s.ref)}
              />
            ))
          )}
        </div>
      </div>

      {bulkMoveOpen && (
        <div className="fixed inset-0 z-30 flex cursor-pointer items-center justify-center px-4" style={{ background: 'var(--scrim)' }} onClick={() => setBulkMoveOpen(false)}>
          <div className="w-full max-w-sm cursor-default rounded-[var(--radius)] border border-[var(--border)] bg-[var(--elev)] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4">
              <h2 className="text-lg font-semibold">批量移动到分类</h2>
              <p className="mt-1 text-sm text-[var(--fg-dim)]">已选择 {selectedRefs.size} 个 skill</p>
            </div>
            <label className="mb-2 block text-sm font-medium" htmlFor="bulk-move-target-category">分类</label>
            <select
              id="bulk-move-target-category"
              value={bulkTargetCategory}
              onChange={(e) => setBulkTargetCategory(e.target.value)}
              className="mb-3 w-full rounded-[var(--radius-s)] border border-[var(--border)] bg-[var(--code)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            >
              {bulkMoveTargets.map((target) => (
                <option key={target} value={target}>{target}</option>
              ))}
            </select>
            {bulkTargetCategory && (
              <p className="mb-4 text-sm text-[var(--fg-dim)]">
                将移动 {skillsMovableToCategory(state.skills, selectedRefs, bulkTargetCategory).length} 个 skill，已在该分类下的选中项会保留原位。
              </p>
            )}
            {bulkMoveTargets.length === 0 && (
              <p className="mb-4 text-sm text-[var(--fg-dim)]">没有可用于当前选择的目标分类。</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkMoveOpen(false)}
                className="rounded-[var(--radius-s)] border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--fg-dim)] hover:bg-[var(--code)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitBulkMove}
                disabled={!bulkTargetCategory || isBulkMoving}
                className="rounded-[var(--radius-s)] bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent-fg)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBulkMoving ? '移动中…' : '移动'}
              </button>
            </div>
          </div>
        </div>
      )}

      {moveSkill && (
        <div className="fixed inset-0 z-30 flex cursor-pointer items-center justify-center px-4" style={{ background: 'var(--scrim)' }} onClick={() => setMoveSkill(null)}>
          <div className="w-full max-w-sm cursor-default rounded-[var(--radius)] border border-[var(--border)] bg-[var(--elev)] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4">
              <h2 className="text-lg font-semibold">移动到分类</h2>
              <p className="mt-1 text-sm text-[var(--fg-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>{moveSkill.ref}</p>
            </div>
            <label className="mb-2 block text-sm font-medium" htmlFor="move-target-category">分类</label>
            <select
              id="move-target-category"
              value={targetCategory}
              onChange={(e) => setTargetCategory(e.target.value)}
              className="mb-4 w-full rounded-[var(--radius-s)] border border-[var(--border)] bg-[var(--code)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            >
              {moveTargets.map((target) => (
                <option key={target} value={target}>{target}</option>
              ))}
            </select>
            {moveTargets.length === 0 && (
              <p className="mb-4 text-sm text-[var(--fg-dim)]">没有其他分类可选。</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMoveSkill(null)}
                className="rounded-[var(--radius-s)] border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--fg-dim)] hover:bg-[var(--code)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitMove}
                disabled={!targetCategory || removingRef === moveSkill.ref}
                className="rounded-[var(--radius-s)] bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent-fg)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {removingRef === moveSkill.ref ? '移动中…' : '移动'}
              </button>
            </div>
          </div>
        </div>
      )}

      {openSkill && (
        <SkillDrawer
          skill={openSkill}
          onClose={() => setOpenRef(null)}
          onMoveTo={() => openMoveDialog(openSkill)}
          onRemove={() => removeSkill(openSkill)}
          isRemoving={removingRef === openSkill.ref}
        />
      )}
    </div>
  );
};
