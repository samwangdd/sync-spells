import React, { useEffect, useRef, useState } from 'react';
import type { AppState } from '@shared/contract';
import { fetchState } from './api';
import { ScenesView } from './views/ScenesView';
import { CatalogView } from './views/CatalogView';
import { isSearchShortcut } from './searchShortcut';

type Tab = 'scenes' | 'catalog';

export const App: React.FC = () => {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('scenes');
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const reload = () => fetchState().then(setState).catch((e) => setError(String(e.message || e)));
  useEffect(() => { reload(); }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isSearchShortcut(event)) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-[var(--mx-border)] bg-[var(--mx-surface)] px-6 py-3"
        style={{ boxShadow: 'var(--mx-shadow)' }}>
        <h1 className="text-lg font-semibold">Spells</h1>
        <nav className="flex gap-1 rounded-full bg-[var(--mx-bg)] p-1">
          {(['scenes', 'catalog'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1 text-sm ${tab === t ? 'bg-[var(--mx-primary)] text-white' : 'text-[var(--mx-muted)]'}`}>
              {t === 'scenes' ? '场景' : '目录'}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex w-64 items-center gap-2 rounded-full border border-[var(--mx-border)] bg-[var(--mx-bg)] px-3 py-1.5 focus-within:border-[var(--mx-primary)]">
          <kbd className="rounded border border-[var(--mx-border)] bg-[var(--mx-surface)] px-1.5 py-0.5 text-[0.68rem] font-medium leading-none text-[var(--mx-muted)]">
            ⌘K
          </kbd>
          <input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索 skill / 场景…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
        {!state ? (
          <p className="text-[var(--mx-muted)]">Loading…</p>
        ) : tab === 'scenes' ? (
          <ScenesView state={state} search={search} onSaved={reload} onError={setError} />
        ) : (
          <CatalogView state={state} search={search} onSaved={reload} onError={setError} />
        )}
      </main>
    </div>
  );
};
