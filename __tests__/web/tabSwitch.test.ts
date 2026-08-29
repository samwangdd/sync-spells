import { describe, expect, test } from '@jest/globals';
import { applyTabChange } from '../../webui/src/tabSwitch';

describe('applyTabChange', () => {
  test('clears the search box when switching to the other tab', () => {
    expect(applyTabChange({ tab: 'catalog', search: 'writing' }, 'scenes')).toEqual({
      tab: 'scenes',
      search: '',
    });
  });

  test('clears the search box switching back as well', () => {
    expect(applyTabChange({ tab: 'scenes', search: '市场调研' }, 'catalog')).toEqual({
      tab: 'catalog',
      search: '',
    });
  });

  test('keeps the query when the active tab is clicked again', () => {
    expect(applyTabChange({ tab: 'catalog', search: 'writing' }, 'catalog')).toEqual({
      tab: 'catalog',
      search: 'writing',
    });
  });
});
