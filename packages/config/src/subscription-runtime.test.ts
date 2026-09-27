import { describe, expect, it } from 'vitest';

import { ConfigError } from './runtime';
import { parseSubscriptionAppConfig } from './subscription-runtime';

describe('subscription application runtime config', () => {
  it('accepts only a fixed HTTP(S) control-plane origin', () => {
    expect(
      parseSubscriptionAppConfig({
        CONTROL_PLANE_INTERNAL_URL: 'http://panel.internal:3000',
      }).controlPlaneInternalUrl.origin,
    ).toBe('http://panel.internal:3000');
    for (const value of [
      'file:///data/panel',
      'https://user:password@panel.example.test',
      'https://panel.example.test/api',
      'https://panel.example.test/#fragment',
    ]) {
      expect(() =>
        parseSubscriptionAppConfig({ CONTROL_PLANE_INTERNAL_URL: value }),
      ).toThrowError(ConfigError);
    }
  });

  it('reports only the required server-side variable', () => {
    expect(() => parseSubscriptionAppConfig({})).toThrow(
      'CONTROL_PLANE_INTERNAL_URL',
    );
  });
});
