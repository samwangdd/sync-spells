import { describe, expect, test } from '@jest/globals';
import { isSearchShortcut } from '../../webui/src/searchShortcut';

const keyEvent = (event: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}) => ({
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...event,
});

describe('isSearchShortcut', () => {
  test('matches Command+K', () => {
    expect(isSearchShortcut(keyEvent({ key: 'k', metaKey: true }))).toBe(true);
  });

  test('matches Ctrl+K for non-Mac keyboards', () => {
    expect(isSearchShortcut(keyEvent({ key: 'K', ctrlKey: true }))).toBe(true);
  });

  test('ignores modified or unrelated shortcuts', () => {
    expect(isSearchShortcut(keyEvent({ key: 'k' }))).toBe(false);
    expect(isSearchShortcut(keyEvent({ key: 'j', metaKey: true }))).toBe(false);
    expect(isSearchShortcut(keyEvent({ key: 'k', metaKey: true, altKey: true }))).toBe(false);
    expect(isSearchShortcut(keyEvent({ key: 'k', metaKey: true, shiftKey: true }))).toBe(false);
  });
});
