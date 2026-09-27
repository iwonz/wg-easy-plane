import { describe, expect, it } from 'vitest';

import { browserSecurityHeaders } from './security-headers';

describe('browser security headers', () => {
  it('blocks embedding, plugins, foreign bases, and cross-origin isolation', () => {
    const headers = Object.fromEntries(
      browserSecurityHeaders().map(({ key, value }) => [
        key.toLowerCase(),
        value,
      ]),
    );

    expect(headers['content-security-policy']).toContain("base-uri 'none'");
    expect(headers['content-security-policy']).toContain("object-src 'none'");
    expect(headers['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['strict-transport-security']).toContain('max-age=63072000');
  });

  it('returns independent mutable arrays for Next.js configuration', () => {
    const first = browserSecurityHeaders();
    const second = browserSecurityHeaders();

    first[0]!.value = 'changed';
    expect(second[0]!.value).not.toBe('changed');
  });

  it('allows eval only when development mode is explicitly enabled', () => {
    const defaultPolicy = browserSecurityHeaders().find(
      ({ key }) => key === 'Content-Security-Policy',
    )?.value;
    const productionPolicy = browserSecurityHeaders({
      development: false,
    }).find(({ key }) => key === 'Content-Security-Policy')?.value;
    const developmentPolicy = browserSecurityHeaders({
      development: true,
    }).find(({ key }) => key === 'Content-Security-Policy')?.value;

    expect(defaultPolicy).not.toContain("'unsafe-eval'");
    expect(productionPolicy).not.toContain("'unsafe-eval'");
    expect(developmentPolicy).toContain(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    );
  });
});
