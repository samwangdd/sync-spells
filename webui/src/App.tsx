import React, { useEffect, useState } from 'react';
import type { AppState } from '@shared/contract';
import { fetchState } from './api';
import { ScenesView } from './views/ScenesView';
import { CatalogView } from './views/CatalogView';

type Tab = 'scenes' | 'catalog';

export const App: React.FC = () => {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('scenes');
  const [search, setSearch] = useState('');

  const reload = () => fetchState().then(setState).catch((e) => setError(String(e.message || e)));
  useEffect(() => { reload(); }, []);

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
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索 skill / 场景…"
          className="ml-auto w-64 rounded-full border border-[var(--mx-border)] bg-[var(--mx-bg)] px-4 py-1.5 text-sm outline-none focus:border-[var(--mx-primary)]" />
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
