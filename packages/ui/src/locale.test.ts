import { describe, expect, it } from 'vitest';

import { resolveLocale } from './locale';

describe('resolveLocale', () => {
  it('prefers a supported cookie', () => {
    expect(resolveLocale('en', 'ru-RU')).toBe('en');
  });

  it('selects Russian from the browser preference', () => {
    expect(resolveLocale(undefined, 'ru-RU,ru;q=0.9,en;q=0.8')).toBe('ru');
  });

  it('falls back to English', () => {
    expect(resolveLocale(undefined, 'de-DE')).toBe('en');
  });
});
