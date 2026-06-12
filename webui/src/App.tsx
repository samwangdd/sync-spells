import React, { useEffect, useRef, useState } from 'react';
import type { AppState } from '@shared/contract';
import { fetchState } from './api';
import { ScenesView } from './views/ScenesView';
import { CatalogView } from './views/CatalogView';
import { isSearchShortcut } from './searchShortcut';
import { nextTheme, THEME_STORAGE_KEY, type Theme } from './theme';
import { buildCatalogUrlState, parseCatalogUrlState, resolveCategoryFromQuery, type QueryTab } from './urlState';

type Tab = QueryTab;

const currentTheme = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
const currentUrlState = () => parseCatalogUrlState(window.location.search);
const tabHelp: Record<Tab, string> = {
  scenes: '场景是不同分类 skills 的组合，通常为了完成某个项目，比如市场调研--不仅需要 Marketing Research，还需要 Writing skill；组合成为场景后，便于在多个项目中复用',
  catalog: '分类是 skills 的组织方式，通常按某一类技能划分，如 Writing、Coding',
};

export const App: React.FC = () => {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(() => currentUrlState().tab);
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const toggleTheme = () => {
    const next = nextTheme(theme);
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_STORAGE_KEY, next);
    setTheme(next);
  };

  const reload = () => fetchState().then((nextState) => {
    setState(nextState);
    if (!state) setCategory(resolveCategoryFromQuery(currentUrlState().categorySlug, nextState.categories));
  }).catch((e) => setError(String(e.message || e)));
  useEffect(() => { reload(); }, []);
  useEffect(() => {
    if (!state) return;
    const nextQuery = buildCatalogUrlState(tab, category).toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', nextUrl);
  }, [state, tab, category]);
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
        <h1 className="mx-serif text-xl font-semibold">Spells</h1>
        <nav className="flex gap-1 rounded-full bg-[var(--mx-bg)] p-1">
          {(['scenes', 'catalog'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1 text-sm ${tab === t ? 'bg-[var(--mx-primary)] text-white' : 'text-[var(--mx-muted)]'}`}>
              {t === 'scenes' ? '场景' : '分类'}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex w-64 items-center gap-2 rounded-full border border-[var(--mx-border)] bg-[var(--mx-bg)] px-3 py-1.5 focus-within:border-[var(--mx-primary)]">
          <kbd className="inline-flex min-w-10 items-center justify-center gap-0.5 rounded-md border border-[var(--mx-border)] bg-[var(--mx-surface)] px-2 py-1 text-xs font-semibold leading-none text-[var(--mx-text)] shadow-[inset_0_-1px_0_rgba(35,33,30,0.1),0_1px_2px_rgba(35,33,30,0.07)]">
            <span className="text-sm leading-none">⌘</span>
            <span>K</span>
          </kbd>
          <input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索 skill / 场景…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? '切换到亮色' : '切换到暗色'}
          title={theme === 'dark' ? '切换到亮色' : '切换到暗色'}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--mx-border)] bg-[var(--mx-bg)] text-base text-[var(--mx-muted)] transition hover:border-[var(--mx-primary)] hover:text-[var(--mx-primary)]"
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {error && <div className="mb-4 rounded-lg bg-[var(--mx-danger-soft)] px-4 py-2 text-sm text-[var(--mx-danger)]">{error}</div>}
        <p className="mb-5 text-sm leading-6 text-[var(--mx-muted)]">{tabHelp[tab]}</p>
        {!state ? (
          <p className="text-[var(--mx-muted)]">Loading…</p>
        ) : tab === 'scenes' ? (
          <ScenesView state={state} search={search} onSaved={reload} onError={setError} />
        ) : (
          <CatalogView state={state} search={search} category={category} onCategoryChange={setCategory} onSaved={reload} onError={setError} />
        )}
      </main>
    </div>
  );
};
