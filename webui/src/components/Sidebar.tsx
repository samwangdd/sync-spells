import React from 'react';
import type { QueryTab } from '../urlState';
import type { Theme } from '../theme';
import { ScenesIcon, SkillsIcon, SunIcon, MoonIcon } from './icons';

const APP_VERSION = 'local · v2.0.0';

type NavItem = { tab: QueryTab; label: string; icon: React.FC<{ size?: number; className?: string }>; count: number };

export const Sidebar: React.FC<{
  tab: QueryTab;
  onTab: (tab: QueryTab) => void;
  profileCount: number;
  skillCount: number;
  theme: Theme;
  onToggleTheme: () => void;
}> = ({ tab, onTab, profileCount, skillCount, theme, onToggleTheme }) => {
  const items: NavItem[] = [
    { tab: 'catalog', label: '分类', icon: SkillsIcon, count: skillCount },
    { tab: 'scenes', label: '场景', icon: ScenesIcon, count: profileCount },
  ];

  return (
    <aside className="flex h-screen w-[250px] shrink-0 flex-col gap-5 border-r border-[var(--border)] bg-[var(--elev)] px-4 py-5">
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-s)] bg-[var(--accent)] text-base font-bold text-[var(--accent-fg)]"
          aria-hidden="true"
        >
          &gt;
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[15px] font-bold tracking-[-0.02em]">sync·spells</span>
          <span className="font-mono text-[10.5px] text-[var(--fg-mute)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {APP_VERSION}
          </span>
        </span>
      </div>

      {/* Workspace nav */}
      <nav className="flex flex-col gap-[3px]">
        <span
          className="mb-1 px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--fg-mute)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          // workspace
        </span>
        {items.map(({ tab: t, label, icon: Icon, count }) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onTab(t)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-2.5 rounded-[var(--radius-s)] px-[11px] py-[9px] text-[13.5px] transition ${
                active
                  ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent)]'
                  : 'font-medium text-[var(--fg-dim)] hover:bg-[var(--code)]'
              }`}
            >
              <Icon size={16} />
              <span className="flex-1 text-left">{label}</span>
              <span className="text-[11.5px] text-[var(--fg-mute)]" style={{ fontFamily: 'var(--font-mono)' }}>
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Footer — theme toggle */}
      <div className="mt-auto flex items-center justify-between border-t border-[var(--border)] pt-4">
        <span className="text-[12px] text-[var(--fg-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>
          theme: {theme}
        </span>
        <button
          type="button"
          onClick={onToggleTheme}
          role="switch"
          aria-checked={theme === 'dark'}
          aria-label={theme === 'dark' ? '切换到亮色' : '切换到暗色'}
          title={theme === 'dark' ? '切换到亮色' : '切换到暗色'}
          className="relative h-6 w-[46px] rounded-full border border-[var(--border-strong)] bg-[var(--code)] transition"
        >
          <span
            className="absolute top-1/2 flex h-[18px] w-[18px] -translate-y-1/2 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-fg)] transition-all"
            style={{ left: theme === 'dark' ? 'calc(100% - 21px)' : '3px' }}
          >
            {theme === 'dark' ? <MoonIcon size={11} /> : <SunIcon size={11} />}
          </span>
        </button>
      </div>
    </aside>
  );
};
