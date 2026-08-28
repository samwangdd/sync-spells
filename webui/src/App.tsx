import React, { useEffect, useRef, useState } from 'react';
import type { AppState } from '@shared/contract';
import { fetchState } from './api';
import { ScenesView } from './views/ScenesView';
import { CatalogView } from './views/CatalogView';
import { Sidebar } from './components/Sidebar';
import { isSearchShortcut } from './searchShortcut';
import { nextTheme, THEME_STORAGE_KEY, type Theme } from './theme';
import { buildCatalogUrlState, parseCatalogUrlState, resolveCategoryFromQuery, type QueryTab } from './urlState';
import { applyTabChange } from './tabSwitch';

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

  const changeTab = (nextTab: Tab) => {
    const next = applyTabChange({ tab, search }, nextTab);
    setTab(next.tab);
    setSearch(next.search);
  };

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
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        tab={tab}
        onTab={changeTab}
        profileCount={state?.profiles.length ?? 0}
        skillCount={state?.skills.length ?? 0}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <main className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-[30px] mt-6 rounded-[var(--radius-s)] border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-2 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}
        {!state ? (
          <p className="px-[30px] py-6 text-[var(--fg-mute)]" style={{ fontFamily: 'var(--font-mono)' }}>Loading…</p>
        ) : tab === 'scenes' ? (
          <ScenesView
            state={state}
            search={search}
            onSearch={setSearch}
            searchRef={searchInputRef}
            subtitle={tabHelp.scenes}
            onSaved={reload}
            onError={setError}
          />
        ) : (
          <CatalogView
            state={state}
            search={search}
            onSearch={setSearch}
            searchRef={searchInputRef}
            subtitle={tabHelp.catalog}
            category={category}
            onCategoryChange={setCategory}
            onSaved={reload}
            onError={setError}
          />
        )}
      </main>
    </div>
  );
};
