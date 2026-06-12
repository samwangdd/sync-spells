export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'spells-theme';

const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark';

/** Stored preference wins; otherwise fall back to the OS-level color scheme. */
export const resolveInitialTheme = (stored: string | null, systemPrefersDark: boolean): Theme => {
  if (isTheme(stored)) return stored;
  return systemPrefersDark ? 'dark' : 'light';
};

export const nextTheme = (current: Theme): Theme => (current === 'dark' ? 'light' : 'dark');
