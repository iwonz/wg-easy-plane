import { describe, expect, it } from 'vitest';

import { nextColorScheme, nextLocale } from './shell-controls';

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
});
