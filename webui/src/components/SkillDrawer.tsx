import React, { useEffect, useState } from 'react';
import type { SkillCard as SkillCardData } from '@shared/contract';
import { fetchMarkdown } from '../api';

export const SkillDrawer: React.FC<{ skill: SkillCardData; onClose: () => void }> = ({ skill, onClose }) => {
  const [markdown, setMarkdown] = useState<string>('Loading…');
  useEffect(() => {
    let active = true;
    fetchMarkdown(skill.ref).then((r) => active && setMarkdown(r.markdown)).catch((e) => active && setMarkdown(String(e.message || e)));
    return () => { active = false; };
  }, [skill.ref]);

  return (
    <div className="fixed inset-0 z-20 flex cursor-pointer justify-end bg-black/20" onClick={onClose}>
      <aside className="h-full w-full max-w-xl cursor-default overflow-y-auto bg-[var(--mx-surface)] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{skill.name}</h2>
          <button onClick={onClose} className="text-[var(--mx-muted)]">✕</button>
        </div>
        <p className="mb-2 text-sm text-[var(--mx-muted)]">{skill.ref}</p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {skill.inProfiles.map((p) => (
            <span key={p} className="rounded bg-[var(--mx-primary-soft)] px-2 py-0.5 text-xs text-[var(--mx-primary)]">{p}</span>
          ))}
        </div>
        <pre className="whitespace-pre-wrap rounded-lg bg-[var(--mx-bg)] p-4 text-xs leading-relaxed">{markdown}</pre>
      </aside>
    </div>
  );
};
