import React from 'react';
import type { ProfileView } from '@shared/contract';

export const ProfileCard: React.FC<{ profile: ProfileView; onOpen: () => void }> = ({ profile, onOpen }) => (
  <button onClick={onOpen}
    className="flex flex-col gap-2 rounded-[var(--mx-radius)] border border-[var(--mx-border)] bg-[var(--mx-surface)] p-5 text-left transition hover:border-[var(--mx-primary)]"
    style={{ boxShadow: 'var(--mx-shadow)' }}>
    <span className="text-base font-semibold">{profile.name}</span>
    <span className="text-sm text-[var(--mx-muted)]">{profile.skillCount} skills</span>
    {profile.boundPaths.length > 0 && (
      <div className="mt-1 flex flex-wrap gap-1.5">
        {profile.boundPaths.map((p) => (
          <span key={p} className="truncate rounded bg-[var(--mx-bg)] px-1.5 py-0.5 text-xs text-[var(--mx-muted)]" title={p}>{p}</span>
        ))}
      </div>
    )}
  </button>
);
