import React, { useMemo, useState } from 'react';
import type { AppState, SkillCard as SkillCardData } from '@shared/contract';
import { buildCategoryCounts, formatCategoryFilterLabel } from '@shared/catalogCounts';
import { SkillCard } from '../components/SkillCard';
import { SkillDrawer } from '../components/SkillDrawer';
import { createCategory, moveSkillToCategory, removeSkillFromCategory } from '../api';
import { moveSelectedSkillsToCategory, skillsMovableToCategory, toggleSelectedRef } from './bulkSkillSelection';

export const CatalogView: React.FC<{
  state: AppState;
  search: string;
  category: string;
  onCategoryChange: (category: string) => void;
  onSaved: () => void;
  onError: (message: string | null) => void;
}> = ({ state, search, category, onCategoryChange, onSaved, onError }) => {
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

  const byCategory = useMemo(() => {
    const map = new Map<string, SkillCardData[]>();
    for (const s of filtered) (map.get(s.category) ?? map.set(s.category, []).get(s.category)!).push(s);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);
  const categoryCounts = useMemo(() => buildCategoryCounts(state.skills), [state.skills]);

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

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {['all', ...state.categories.map((c) => c.name)].map((c) => (
          <button key={c} onClick={() => onCategoryChange(c)}
            className={`rounded-full px-3 py-1 text-sm ${category === c ? 'bg-[var(--mx-primary)] text-white' : 'bg-[var(--mx-surface)] text-[var(--mx-muted)] border border-[var(--mx-border)]'}`}>
            {formatCategoryFilterLabel(c, categoryCounts)}
          </button>
        ))}
        <button
          type="button"
          onClick={addCategory}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--mx-border)] bg-[var(--mx-surface)] px-3 py-1 text-sm text-[var(--mx-muted)] transition hover:border-[var(--mx-primary)] hover:text-[var(--mx-primary)]"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-xs leading-none">+</span>
          新增分类
        </button>
      </div>
      {selectedRefs.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[var(--mx-radius)] border border-[var(--mx-border)] bg-[var(--mx-surface)] px-3 py-2">
          <span className="text-sm font-medium">已选择 {selectedRefs.size} 个 skill</span>
          <button
            type="button"
            onClick={openBulkMoveDialog}
            disabled={bulkMoveTargets.length === 0}
            className="rounded-[var(--mx-radius)] bg-[var(--mx-primary)] px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            批量移动到分类
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="rounded-[var(--mx-radius)] border border-[var(--mx-border)] px-3 py-1.5 text-sm text-[var(--mx-muted)] hover:bg-[var(--mx-bg)]"
          >
            清除选择
          </button>
        </div>
      )}
      {byCategory.map(([cat, skills]) => (
        <section key={cat} className="mb-8">
          <h3 className="mx-serif mb-3 text-[1.26rem] font-semibold uppercase tracking-wide text-[var(--mx-text)]">{cat}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {skills.map((s) => (
              <SkillCard
                key={s.ref}
                skill={s}
                onOpen={() => setOpenRef(s.ref)}
                onRemove={() => removeSkill(s)}
                onMoveTo={() => openMoveDialog(s)}
                isRemoving={removingRef === s.ref}
                isSelected={selectedRefs.has(s.ref)}
                onToggleSelected={() => toggleSkillSelection(s.ref)}
              />
            ))}
          </div>
        </section>
      ))}
      {bulkMoveOpen && (
        <div className="fixed inset-0 z-30 flex cursor-pointer items-center justify-center bg-[var(--mx-overlay)] px-4" onClick={() => setBulkMoveOpen(false)}>
          <div className="w-full max-w-sm cursor-default rounded-[var(--mx-radius)] bg-[var(--mx-surface)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4">
              <h2 className="mx-serif text-lg font-semibold">批量移动到分类</h2>
              <p className="mt-1 text-sm text-[var(--mx-muted)]">已选择 {selectedRefs.size} 个 skill</p>
            </div>
            <label className="mb-2 block text-sm font-medium" htmlFor="bulk-move-target-category">分类</label>
            <select
              id="bulk-move-target-category"
              value={bulkTargetCategory}
              onChange={(e) => setBulkTargetCategory(e.target.value)}
              className="mb-3 w-full rounded-[var(--mx-radius)] border border-[var(--mx-border)] bg-[var(--mx-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--mx-primary)]"
            >
              {bulkMoveTargets.map((target) => (
                <option key={target} value={target}>{target}</option>
              ))}
            </select>
            {bulkTargetCategory && (
              <p className="mb-4 text-sm text-[var(--mx-muted)]">
                将移动 {skillsMovableToCategory(state.skills, selectedRefs, bulkTargetCategory).length} 个 skill，已在该分类下的选中项会保留原位。
              </p>
            )}
            {bulkMoveTargets.length === 0 && (
              <p className="mb-4 text-sm text-[var(--mx-muted)]">没有可用于当前选择的目标分类。</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkMoveOpen(false)}
                className="rounded-[var(--mx-radius)] border border-[var(--mx-border)] px-3 py-1.5 text-sm text-[var(--mx-muted)] hover:bg-[var(--mx-bg)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitBulkMove}
                disabled={!bulkTargetCategory || isBulkMoving}
                className="rounded-[var(--mx-radius)] bg-[var(--mx-primary)] px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBulkMoving ? '移动中…' : '移动'}
              </button>
            </div>
          </div>
        </div>
      )}
      {moveSkill && (
        <div className="fixed inset-0 z-30 flex cursor-pointer items-center justify-center bg-[var(--mx-overlay)] px-4" onClick={() => setMoveSkill(null)}>
          <div className="w-full max-w-sm cursor-default rounded-[var(--mx-radius)] bg-[var(--mx-surface)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4">
              <h2 className="mx-serif text-lg font-semibold">移动到分类</h2>
              <p className="mt-1 text-sm text-[var(--mx-muted)]">{moveSkill.ref}</p>
            </div>
            <label className="mb-2 block text-sm font-medium" htmlFor="move-target-category">分类</label>
            <select
              id="move-target-category"
              value={targetCategory}
              onChange={(e) => setTargetCategory(e.target.value)}
              className="mb-4 w-full rounded-[var(--mx-radius)] border border-[var(--mx-border)] bg-[var(--mx-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--mx-primary)]"
            >
              {moveTargets.map((target) => (
                <option key={target} value={target}>{target}</option>
              ))}
            </select>
            {moveTargets.length === 0 && (
              <p className="mb-4 text-sm text-[var(--mx-muted)]">没有其他分类可选。</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMoveSkill(null)}
                className="rounded-[var(--mx-radius)] border border-[var(--mx-border)] px-3 py-1.5 text-sm text-[var(--mx-muted)] hover:bg-[var(--mx-bg)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitMove}
                disabled={!targetCategory || removingRef === moveSkill.ref}
                className="rounded-[var(--mx-radius)] bg-[var(--mx-primary)] px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {removingRef === moveSkill.ref ? '移动中…' : '移动'}
              </button>
            </div>
          </div>
        </div>
      )}
      {openSkill && <SkillDrawer skill={openSkill} onClose={() => setOpenRef(null)} />}
    </div>
  );
};
