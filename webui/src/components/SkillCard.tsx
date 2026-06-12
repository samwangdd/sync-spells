import React from 'react';
import type { SkillCard as SkillCardData } from '@shared/contract';

export const SkillCard: React.FC<{
  skill: SkillCardData;
  onOpen: () => void;
  onRemove: () => void;
  onMoveTo: () => void;
  isRemoving: boolean;
}> = ({ skill, onOpen, onRemove, onMoveTo, isRemoving }) => (
  <div
    className="relative flex flex-col gap-2 rounded-[var(--mx-radius)] border border-[var(--mx-border)] bg-[var(--mx-surface)] p-4 text-left transition hover:border-[var(--mx-primary)]"
    style={{ boxShadow: 'var(--mx-shadow)' }}>
    <div className="flex items-center justify-between gap-2">
      <button onClick={onOpen} className="min-w-0 flex-1 text-left font-medium hover:text-[var(--mx-primary)]">
        {skill.name}
      </button>
      {skill.version && <span className="rounded bg-[var(--mx-bg)] px-1.5 py-0.5 text-xs text-[var(--mx-muted)]">v{skill.version}</span>}
      <details className="group relative">
        <summary className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-full text-[var(--mx-muted)] hover:bg-[var(--mx-bg)] hover:text-[var(--mx-primary)]">
          <span className="-translate-y-0.5 text-base leading-none">...</span>
        </summary>
        <div className="absolute right-0 z-10 mt-1 w-32 overflow-hidden rounded-[var(--mx-radius)] border border-[var(--mx-border)] bg-[var(--mx-surface)] shadow-lg">
          <button
            type="button"
            onClick={onRemove}
            disabled={isRemoving}
            className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRemoving ? 'Removing...' : 'Remove'}
          </button>
          <button
            type="button"
            onClick={onMoveTo}
            className="block w-full px-3 py-2 text-left text-sm text-[var(--mx-text)] hover:bg-[var(--mx-bg)]"
          >
            Move to
          </button>
        </div>
      </details>
    </div>
    {skill.description && <p className="line-clamp-3 text-sm text-[var(--mx-muted)]">{skill.description}</p>}
    <div className="mt-auto flex flex-wrap items-center gap-1.5">
      {(skill.requiresBins ?? []).map((bin) => (
        <span key={bin} className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">⌘ {bin}</span>
      ))}
      <span className="rounded bg-[var(--mx-primary-soft)] px-1.5 py-0.5 text-xs text-[var(--mx-primary)]">
        出现在 {skill.inProfiles.length} 个场景
      </span>
    </div>
  </div>
);
