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
  <header className="px-[30px] pb-[18px] pt-6">
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-[25px] font-bold tracking-[-0.03em]">{title}</h1>
      {count !== undefined && (
        <span
          className="rounded-full border border-[var(--border)] bg-[var(--code)] px-2 py-0.5 text-[12px] text-[var(--fg-dim)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {count}
        </span>
      )}
      <div className="ml-auto flex items-center gap-2.5">
        <label className="flex h-[38px] w-64 items-center gap-2 rounded-[var(--radius-s)] border border-[var(--border)] bg-[var(--elev)] px-3 focus-within:border-[var(--accent)]">
          <SearchIcon size={15} className="text-[var(--fg-mute)]" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--fg-mute)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
          <kbd
            className="rounded-[3px] border border-[var(--border)] bg-[var(--code)] px-1.5 py-0.5 text-[10.5px] text-[var(--fg-mute)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            ⌘K
          </kbd>
        </label>
        {action}
      </div>
    </div>
    {subtitle && <p className="mt-2 max-w-3xl text-[13.5px] leading-6 text-[var(--fg-dim)]">{subtitle}</p>}
  </header>
);
