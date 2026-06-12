import { describe, expect, test } from '@jest/globals';
import { resolveInitialTheme, nextTheme, THEME_STORAGE_KEY } from '../../webui/src/theme';

describe('resolveInitialTheme', () => {
  test('stored value wins over system preference', () => {
    expect(resolveInitialTheme('dark', false)).toBe('dark');
    expect(resolveInitialTheme('light', true)).toBe('light');
  });

  test('falls back to system preference when nothing stored', () => {
    expect(resolveInitialTheme(null, true)).toBe('dark');
    expect(resolveInitialTheme(null, false)).toBe('light');
  });

  test('invalid stored value falls back to system preference', () => {
    expect(resolveInitialTheme('purple', true)).toBe('dark');
    expect(resolveInitialTheme('', false)).toBe('light');
  });
});

describe('nextTheme', () => {
  test('toggles between light and dark', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
  });
});

describe('THEME_STORAGE_KEY', () => {
  test('is a stable non-empty string', () => {
    expect(typeof THEME_STORAGE_KEY).toBe('string');
    expect(THEME_STORAGE_KEY.length).toBeGreaterThan(0);
  });
});
