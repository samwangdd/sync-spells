import React, { useEffect, useRef, useState } from 'react';
import type { SkillCard as SkillCardData } from '@shared/contract';
import { copyText } from '../copyText';
import { isSkillActive } from '../skillStatus';
import { CheckIcon, CopyIcon } from './icons';
import { shouldCloseSkillCardMenu } from './skillCardMenu';

/** Shared grid template for the skills table — keeps the header row and data rows aligned. */
export const SKILL_GRID = '22px 16px minmax(0,1.6fr) 96px 60px 72px 92px 30px';

export const SkillRow: React.FC<{
  skill: SkillCardData;
  onOpen: () => void;
  onRemove: () => void;
  onMoveTo: () => void;
  isRemoving: boolean;
  isSelected: boolean;
  onToggleSelected: () => void;
}> = ({ skill, onOpen, onRemove, onMoveTo, isRemoving, isSelected, onToggleSelected }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const active = isSkillActive(skill);

  useEffect(() => {
    if (!isMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (shouldCloseSkillCardMenu(menuRef.current, event.target as object | null)) setIsMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [isMenuOpen]);

  const copySkillName = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    await copyText(skill.name, navigator.clipboard);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      onClick={onOpen}
      className={`grid cursor-pointer items-center border-b border-[var(--border)] px-4 py-[13px] text-[12.5px] transition last:border-b-0 ${
        isSelected ? 'bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]' : 'hover:bg-[var(--code)]'
      }`}
      style={{ gridTemplateColumns: SKILL_GRID, columnGap: 14, fontFamily: 'var(--font-mono)' }}
    >
      {/* select */}
      <label className="flex items-center justify-center" onClick={(e) => e.stopPropagation()} title={`选择 ${skill.ref}`}>
        <input type="checkbox" checked={isSelected} onChange={onToggleSelected} className="h-3.5 w-3.5 accent-[var(--accent)]" />
      </label>

      {/* status dot — read-only: glowing when the skill appears in ≥1 scene */}
      <span className="flex items-center justify-center" title={active ? `在 ${skill.inProfiles.length} 个场景中` : '未在场景中'}>
        <span
          className="h-[9px] w-[9px] rounded-full"
          style={{
            background: active ? 'var(--accent)' : 'var(--fg-mute)',
            boxShadow: active ? '0 0 8px var(--accent)' : 'none',
          }}
        />
      </span>

      {/* name + description */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 truncate font-medium text-[var(--fg)]">{skill.name}</div>
          <button
            type="button"
            onClick={copySkillName}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-s)] border border-[var(--border)] transition hover:border-[var(--border-strong)] hover:text-[var(--fg)] ${
              copied ? 'text-emerald-500' : 'text-[var(--fg-mute)]'
            }`}
            title={copied ? '已复制' : `复制 ${skill.name}`}
            aria-label={copied ? '已复制' : `复制 ${skill.name}`}
          >
            {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
          </button>
        </div>
        {skill.description && <div className="truncate text-[11px] text-[var(--fg-mute)]">{skill.description}</div>}
      </div>

      {/* category */}
      <div className="truncate text-[var(--fg-dim)]">{skill.category}</div>

      {/* tools (required bins) */}
      <div className="text-[var(--fg-dim)]">{(skill.requiresBins ?? []).length || '—'}</div>

      {/* version */}
      <div className="truncate text-[var(--accent)]">{skill.version ? `v${skill.version}` : '—'}</div>

      {/* scenes count */}
      <div className="text-right text-[var(--fg-mute)]">{skill.inProfiles.length}</div>

      {/* menu */}
      <details
        ref={menuRef}
        open={isMenuOpen}
        onToggle={(e) => setIsMenuOpen(e.currentTarget.open)}
        onClick={(e) => e.stopPropagation()}
        className="relative justify-self-end"
      >
        <summary className="flex h-7 w-7 list-none items-center justify-center rounded-[var(--radius-s)] text-[var(--fg-mute)] hover:bg-[var(--border)] hover:text-[var(--accent)]">
          <span className="-translate-y-0.5 text-base leading-none">...</span>
        </summary>
        <div className="absolute right-0 z-10 mt-1 w-32 overflow-hidden rounded-[var(--radius-s)] border border-[var(--border)] bg-[var(--elev)] shadow-lg">
          <button
            type="button"
            onClick={onRemove}
            disabled={isRemoving}
            className="block w-full px-3 py-2 text-left text-[12px] text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRemoving ? '移动中…' : '移到 inbox'}
          </button>
          <button
            type="button"
            onClick={onMoveTo}
            className="block w-full px-3 py-2 text-left text-[12px] text-[var(--fg)] hover:bg-[var(--code)]"
          >
            移动到分类
          </button>
        </div>
      </details>
    </div>
  );
};
