import React from 'react';
import { SearchIcon } from './icons';

export const ViewHeader: React.FC<{
  title: string;
  count?: number;
  subtitle?: string;
  search: string;
  onSearch: (value: string) => void;
  searchRef?: React.Ref<HTMLInputElement>;
  searchPlaceholder?: string;
  action?: React.ReactNode;
}> = ({ title, count, subtitle, search, onSearch, searchRef, searchPlaceholder = '搜索 skill / 场景…', action }) => (
  <header className="px-8 pb-6 pt-8 lg:px-10">
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-[28px] font-bold tracking-[-0.035em]">{title}</h1>
      {count !== undefined && (
        <span
          className="rounded-full border border-[var(--border)] bg-[var(--code)] px-2 py-0.5 text-[12px] text-[var(--fg-dim)]"
        >
          {count}
        </span>
      )}
      <div className="ml-auto flex items-center gap-2.5">
        <label className="flex h-10 w-64 items-center gap-2 rounded-[var(--radius-s)] border border-[var(--border)] bg-[var(--panel)] px-3 shadow-[0_1px_2px_rgba(0,0,0,.04)]">
          <SearchIcon size={15} className="text-[var(--fg-mute)]" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--fg-mute)]"
          />
          <kbd
            className="rounded-md border border-[var(--border)] bg-[var(--code)] px-1.5 py-0.5 text-[10.5px] text-[var(--fg-mute)]"
          >
            ⌘K
          </kbd>
        </label>
        {action}
      </div>
    </div>
    {subtitle && <p className="mt-2 max-w-3xl text-[14px] leading-6 text-[var(--fg-dim)]">{subtitle}</p>}
  </header>
);
