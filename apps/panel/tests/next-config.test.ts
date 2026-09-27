import { describe, expect, it } from 'vitest';
import panelConfig from '../next.config';
import subscriptionConfig from '../../subscription/next.config';

describe('Next.js development origins', () => {
  it('allows only the supported loopback hosts in both applications', () => {
    const expectedOrigins = ['localhost', '127.0.0.1'];

    expect(panelConfig.allowedDevOrigins).toEqual(expectedOrigins);
    expect(subscriptionConfig.allowedDevOrigins).toEqual(expectedOrigins);
  });
});
