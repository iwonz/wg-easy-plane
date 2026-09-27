import { describe, expect, it } from 'vitest';

import { nextColorScheme, nextLocale } from './shell-controls';
import { segmentedTabsStyles, theme } from './theme';

describe('shell control cycles', () => {
  it('cycles through the supported locales', () => {
    expect(nextLocale('en')).toBe('ru');
    expect(nextLocale('ru')).toBe('en');
  });

  it('cycles system, light, and dark in order', () => {
    expect(nextColorScheme('auto')).toBe('light');
    expect(nextColorScheme('light')).toBe('dark');
    expect(nextColorScheme('dark')).toBe('auto');
  });

  it('provides connected tab and bold modal defaults', () => {
    expect(segmentedTabsStyles).toMatchObject({
      list: { display: 'inline-flex', gap: 0 },
      tab: { fontWeight: 600 },
    });
    expect(theme.components?.Modal).toBeDefined();
  });
});
