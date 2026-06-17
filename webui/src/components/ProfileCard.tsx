import React from 'react';
import type { ProfileView } from '@shared/contract';

export const ProfileCard: React.FC<{ profile: ProfileView; onOpen: () => void }> = ({ profile, onOpen }) => (
  <button onClick={onOpen}
    className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--panel)] p-5 text-left transition hover:border-[var(--accent)] hover:bg-[var(--code)]">
    <span className="text-lg font-semibold">{profile.name}</span>
    <span className="text-sm text-[var(--fg-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>{profile.skillCount} skills</span>
    {profile.boundPaths.length > 0 && (
      <div className="mt-1 flex flex-wrap gap-1.5">
        {profile.boundPaths.map((p) => (
          <span key={p} className="truncate rounded-[var(--radius-s)] bg-[var(--code)] px-1.5 py-0.5 text-xs text-[var(--fg-mute)]" style={{ fontFamily: 'var(--font-mono)' }} title={p}>{p}</span>
        ))}
      </div>
    )}
  </button>
);
