import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authenticatedControlPlaneRequest,
  controlPlaneRequest,
  copiedSessionCookie,
  subscriptionCookie,
} from './control-plane';

describe('subscription BFF control-plane boundary', () => {
  beforeEach(() => {
    process.env.CONTROL_PLANE_INTERNAL_URL = 'http://panel.internal:3000';
  });

  afterEach(() => {
    delete process.env.CONTROL_PLANE_INTERNAL_URL;
    vi.unstubAllGlobals();
  });

  it('uses only the fixed origin with redirects disabled and no caching', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response());
    vi.stubGlobal('fetch', fetcher);

    await controlPlaneRequest('/api/v1/subscriptions/client');

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      'http://panel.internal:3000/api/v1/subscriptions/client',
    );
    expect(init).toMatchObject({ cache: 'no-store', redirect: 'error' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects non-fixed paths before any network request', async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetcher);

    await expect(
      controlPlaneRequest('https://attacker.test/api/v1/x'),
    ).rejects.toThrow('Invalid fixed control-plane path');
    await expect(
      controlPlaneRequest('/api/v1/subscriptions/client?token=secret'),
    ).rejects.toThrow('Invalid fixed control-plane path');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('forwards only the named session cookie', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response());
    vi.stubGlobal('fetch', fetcher);
    const request = new NextRequest('https://subscription.example.test/api/x', {
      headers: {
        Authorization: 'Bearer should-not-forward',
        Cookie:
          'analytics=private-value; wgep_subscription=session-jwt; locale=ru',
        'X-Forwarded-Host': 'private-host.test',
      },
    });

    expect(subscriptionCookie(request)).toBe('wgep_subscription=session-jwt');
    await authenticatedControlPlaneRequest(
      request,
      '/api/v1/subscriptions/client',
    );

    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get('cookie')).toBe('wgep_subscription=session-jwt');
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('x-forwarded-host')).toBeNull();
  });

  it('copies only hardened subscription cookies', () => {
    const validCookie =
      'wgep_subscription=session-jwt; Path=/; HttpOnly; Secure; SameSite=Lax';
    const valid = new Response(null, {
      headers: { 'Set-Cookie': validCookie },
    });
    const wrongName = new Response(null, {
      headers: {
        'Set-Cookie': 'admin=session; Path=/; HttpOnly; Secure; SameSite=Lax',
      },
    });
    const weak = new Response(null, {
      headers: {
        'Set-Cookie': 'wgep_subscription=session; Path=/; SameSite=Lax',
      },
    });
    const multipleHeaders = new Headers();
    multipleHeaders.append('Set-Cookie', validCookie);
    multipleHeaders.append(
      'Set-Cookie',
      'admin=unexpected; Path=/; HttpOnly; Secure; SameSite=Lax',
    );

    expect(copiedSessionCookie(valid)).toContain('wgep_subscription=');
    expect(copiedSessionCookie(wrongName)).toBeNull();
    expect(copiedSessionCookie(weak)).toBeNull();
    expect(
      copiedSessionCookie(new Response(null, { headers: multipleHeaders })),
    ).toBeNull();
  });
});
