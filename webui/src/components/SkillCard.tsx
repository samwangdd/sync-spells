import React from 'react';
import type { SkillCard as SkillCardData } from '@shared/contract';

export const SkillCard: React.FC<{ skill: SkillCardData; onOpen: () => void }> = ({ skill, onOpen }) => (
  <button onClick={onOpen}
    className="flex flex-col gap-2 rounded-[var(--mx-radius)] border border-[var(--mx-border)] bg-[var(--mx-surface)] p-4 text-left transition hover:border-[var(--mx-primary)]"
    style={{ boxShadow: 'var(--mx-shadow)' }}>
    <div className="flex items-center justify-between gap-2">
      <span className="font-medium">{skill.name}</span>
      {skill.version && <span className="rounded bg-[var(--mx-bg)] px-1.5 py-0.5 text-xs text-[var(--mx-muted)]">v{skill.version}</span>}
    </div>
    {skill.description && <p className="line-clamp-3 text-sm text-[var(--mx-muted)]">{skill.description}</p>}
    <div className="mt-auto flex flex-wrap gap-1.5">
      {(skill.requiresBins ?? []).map((bin) => (
        <span key={bin} className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">⌘ {bin}</span>
      ))}
      <span className="rounded bg-[var(--mx-primary-soft)] px-1.5 py-0.5 text-xs text-[var(--mx-primary)]">
        出现在 {skill.inProfiles.length} 个场景
      </span>
    </div>
  </button>
);
