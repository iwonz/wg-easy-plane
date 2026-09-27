import { describe, expect, it } from 'vitest';

import { GET } from '../app/healthz/route';

describe('/healthz', () => {
  it('returns a generic no-store healthy response', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
