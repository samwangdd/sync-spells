import React, { useEffect, useState } from 'react';
import type { SkillCard as SkillCardData } from '@shared/contract';
import { fetchMarkdown } from '../api';
import { isSkillActive } from '../skillStatus';
import { CloseIcon } from './icons';

const MetaCell: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="px-4 py-3">
    <div className="text-[10.5px] uppercase tracking-wide text-[var(--fg-mute)]" style={{ fontFamily: 'var(--font-mono)' }}>{label}</div>
    <div className="mt-1 text-[13px] text-[var(--fg)]" style={{ fontFamily: 'var(--font-mono)' }}>{value}</div>
  </div>
);

export const SkillDrawer: React.FC<{
  skill: SkillCardData;
  onClose: () => void;
  onMoveTo: () => void;
  onRemove: () => void;
  isRemoving: boolean;
}> = ({ skill, onClose, onMoveTo, onRemove, isRemoving }) => {
  const [markdown, setMarkdown] = useState<string>('Loading…');
  const [shown, setShown] = useState(false);
  const active = isSkillActive(skill);
  const bins = skill.requiresBins ?? [];
  const initials = skill.name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '>';

  useEffect(() => {
    setShown(true);
  }, []);

  useEffect(() => {
    let activeFetch = true;
    fetchMarkdown(skill.ref).then((r) => activeFetch && setMarkdown(r.markdown)).catch((e) => activeFetch && setMarkdown(String(e.message || e)));
    return () => { activeFetch = false; };
  }, [skill.ref]);

  return (
    <div className="fixed inset-0 z-20 flex cursor-pointer justify-end" style={{ background: 'var(--scrim)' }} onClick={onClose}>
      <aside
        className="flex h-full w-[50vw] min-w-[392px] max-w-[88vw] cursor-default flex-col overflow-y-auto border-l border-[var(--border)] bg-[var(--elev)] transition-transform duration-300 ease-out"
        style={{ boxShadow: '-24px 0 60px -28px rgba(0,0,0,.45)', transform: shown ? 'translateX(0)' : 'translateX(100%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-start gap-3 px-5 pt-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--accent-soft)] text-[15px] font-bold text-[var(--accent)]">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[18px] font-bold">{skill.name}</h2>
            <p className="truncate text-[12px] text-[var(--fg-mute)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {skill.ref}{skill.version ? ` · v${skill.version}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[var(--radius-s)] border border-[var(--border)] text-[var(--fg-dim)] hover:text-[var(--fg)]"
          >
            <CloseIcon size={15} />
          </button>
        </div>

        {/* status card (read-only) */}
        <div className="mx-5 mt-4 flex items-center gap-3 rounded-[var(--radius-s)] bg-[var(--code)] px-4 py-3">
          <span
            className="h-[9px] w-[9px] shrink-0 rounded-full"
            style={{ background: active ? 'var(--accent)' : 'var(--fg-mute)', boxShadow: active ? '0 0 8px var(--accent)' : 'none' }}
          />
          <div className="min-w-0">
            <div className="text-[13px] font-medium">{active ? `在 ${skill.inProfiles.length} 个场景中` : '未在场景中'}</div>
            <div className="text-[11px] text-[var(--fg-mute)]" style={{ fontFamily: 'var(--font-mono)' }}>scene membership · 只读</div>
          </div>
        </div>

        {/* meta grid 2x2 */}
        <div className="mx-5 mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-s)] border border-[var(--border)] bg-[var(--border)]">
          <div className="bg-[var(--elev)]"><MetaCell label="category" value={skill.category} /></div>
          <div className="bg-[var(--elev)]"><MetaCell label="version" value={skill.version ? `v${skill.version}` : '—'} /></div>
          <div className="bg-[var(--elev)]"><MetaCell label="scenes" value={skill.inProfiles.length} /></div>
          <div className="bg-[var(--elev)]"><MetaCell label="tools" value={bins.length} /></div>
        </div>

        {/* description */}
        {skill.description && (
          <div className="mx-5 mt-4">
            <div className="text-[10.5px] uppercase tracking-wide text-[var(--fg-mute)]" style={{ fontFamily: 'var(--font-mono)' }}>description</div>
            <p className="mt-1.5 text-[13.5px] leading-6 text-[var(--fg-dim)]">{skill.description}</p>
          </div>
        )}

        {/* scenes / profiles */}
        {skill.inProfiles.length > 0 && (
          <div className="mx-5 mt-4">
            <div className="text-[10.5px] uppercase tracking-wide text-[var(--fg-mute)]" style={{ fontFamily: 'var(--font-mono)' }}>scenes · {skill.inProfiles.length}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {skill.inProfiles.map((p) => (
                <span key={p} className="rounded-[var(--radius-s)] bg-[var(--accent-soft)] px-2 py-0.5 text-[11.5px] text-[var(--accent)]" style={{ fontFamily: 'var(--font-mono)' }}>{p}</span>
              ))}
            </div>
          </div>
        )}

        {/* tools (required bins) */}
        {bins.length > 0 && (
          <div className="mx-5 mt-4">
            <div className="text-[10.5px] uppercase tracking-wide text-[var(--fg-mute)]" style={{ fontFamily: 'var(--font-mono)' }}>tools · {bins.length}</div>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {bins.map((bin) => (
                <div key={bin} className="flex items-center gap-2 rounded-[var(--radius-s)] bg-[var(--code)] px-3 py-2 text-[12.5px]" style={{ fontFamily: 'var(--font-mono)' }}>
                  <span className="h-[7px] w-[7px] rounded-full bg-[var(--accent)]" />
                  {bin}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SKILL.md */}
        <div className="mx-5 mt-4">
          <div className="text-[10.5px] uppercase tracking-wide text-[var(--fg-mute)]" style={{ fontFamily: 'var(--font-mono)' }}>SKILL.md</div>
          <pre className="mt-1.5 max-h-72 overflow-auto whitespace-pre-wrap rounded-[var(--radius-s)] bg-[var(--code)] p-3 text-[11.5px] leading-relaxed" style={{ fontFamily: 'var(--font-mono)' }}>{markdown}</pre>
        </div>

        {/* actions */}
        <div className="mx-5 mb-5 mt-4 flex gap-2">
          <button
            type="button"
            onClick={onMoveTo}
            className="flex-1 rounded-[var(--radius-s)] bg-[var(--accent)] px-3 py-2 text-[13px] font-semibold text-[var(--accent-fg)] transition hover:opacity-90"
          >
            移动到分类
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={isRemoving}
            className="rounded-[var(--radius-s)] border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--fg-dim)] transition hover:bg-[var(--code)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRemoving ? '移动中…' : '移到 inbox'}
          </button>
        </div>
      </aside>
    </div>
  );
};
