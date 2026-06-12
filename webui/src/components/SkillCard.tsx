import React, { useEffect, useRef, useState } from 'react';
import type { SkillCard as SkillCardData } from '@shared/contract';
import { shouldCloseSkillCardMenu } from './skillCardMenu';

export const SkillCard: React.FC<{
  skill: SkillCardData;
  onOpen: () => void;
  onRemove: () => void;
  onMoveTo: () => void;
  isRemoving: boolean;
}> = ({ skill, onOpen, onRemove, onMoveTo, isRemoving }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (shouldCloseSkillCardMenu(menuRef.current, event.target as object | null)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [isMenuOpen]);

  return (
    <div
      className="relative flex flex-col gap-2 rounded-[var(--mx-radius)] border border-[var(--mx-border)] bg-[var(--mx-surface)] p-4 text-left transition hover:border-[var(--mx-primary)] hover:bg-[var(--mx-surface-hover)]"
      style={{ boxShadow: 'var(--mx-shadow)' }}>
      <div className="flex items-center justify-between gap-2">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left font-medium hover:text-[var(--mx-primary)]">
          {skill.name}
        </button>
        {skill.version && <span className="rounded bg-[var(--mx-bg)] px-1.5 py-0.5 text-xs text-[var(--mx-muted)]">v{skill.version}</span>}
        <details ref={menuRef} open={isMenuOpen} onToggle={(event) => setIsMenuOpen(event.currentTarget.open)} className="group relative">
          <summary className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-full text-[var(--mx-muted)] hover:bg-[var(--mx-bg)] hover:text-[var(--mx-primary)]">
            <span className="-translate-y-0.5 text-base leading-none">...</span>
          </summary>
          <div className="absolute right-0 z-10 mt-1 w-32 overflow-hidden rounded-[var(--mx-radius)] border border-[var(--mx-border)] bg-[var(--mx-surface)] shadow-lg">
            <button
              type="button"
              onClick={onRemove}
              disabled={isRemoving}
              className="block w-full px-3 py-2 text-left text-sm text-[var(--mx-danger)] hover:bg-[var(--mx-danger-soft)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRemoving ? '移动中…' : '移到 inbox'}
            </button>
            <button
              type="button"
              onClick={onMoveTo}
              className="block w-full px-3 py-2 text-left text-sm text-[var(--mx-text)] hover:bg-[var(--mx-bg)]"
            >
              移动到分类
            </button>
          </div>
        </details>
      </div>
      {skill.description && <p className="line-clamp-3 text-sm text-[var(--mx-muted)]">{skill.description}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        {(skill.requiresBins ?? []).map((bin) => (
          <span key={bin} className="rounded bg-[var(--mx-warning-soft)] px-1.5 py-0.5 text-xs text-[var(--mx-warning)]">⌘ {bin}</span>
        ))}
        <span className="rounded bg-[var(--mx-primary-soft)] px-1.5 py-0.5 text-xs text-[var(--mx-primary)]">
          出现在 {skill.inProfiles.length} 个场景
        </span>
      </div>
    </div>
  );
};
