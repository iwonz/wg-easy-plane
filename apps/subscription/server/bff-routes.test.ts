import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getConfiguration } from '../app/api/placements/[placementId]/configuration/route';
import { GET as getQrCode } from '../app/api/placements/[placementId]/qrcode.svg/route';
import { POST as exchange } from '../app/api/session/exchange/route';
import { POST as logout } from '../app/api/session/logout/route';
import { GET as getSummary } from '../app/api/subscription/route';

const placementId = '2d74ed77-6254-4c91-b18c-4fcb0fe4dbbc';
const clientId = 'f39431bc-cfad-48b1-a56c-14b67db1bd48';
const token = `wgep_sub_${'A'.repeat(43)}`;
const hardenedCookie =
  'wgep_subscription=session-jwt; Path=/; HttpOnly; Secure; SameSite=Lax';

function request(
  path: string,
  init: ConstructorParameters<typeof NextRequest>[1] = {},
): NextRequest {
  return new NextRequest(`https://subscription.example.test${path}`, init);
}

function authenticatedRequest(path: string): NextRequest {
  return request(path, {
    headers: {
      Cookie: 'other=discard; wgep_subscription=session-jwt',
      Authorization: 'Bearer discard',
    },
  });
}

describe('subscription BFF routes', () => {
  beforeEach(() => {
    process.env.CONTROL_PLANE_INTERNAL_URL = 'http://panel.internal:3000';
  });

  afterEach(() => {
    delete process.env.CONTROL_PLANE_INTERNAL_URL;
    vi.unstubAllGlobals();
  });

  it('exchanges the token in a body and returns only an HttpOnly cookie', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { sessionExpiresAt: '2026-09-28T12:00:00.000Z' },
          { headers: { 'Set-Cookie': hardenedCookie } },
        ),
      );
    vi.stubGlobal('fetch', fetcher);

    const response = await exchange(
      new Request('https://subscription.example.test/api/session/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBe(hardenedCookie);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.json();
    expect(body).toEqual({ sessionExpiresAt: '2026-09-28T12:00:00.000Z' });
    expect(JSON.stringify(body)).not.toContain(token);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).not.toContain(token);
    expect(init?.body).toBe(JSON.stringify({ token }));
  });

  it('rejects malformed tokens without contacting the control plane', async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetcher);

    const response = await exchange(
      new Request('https://subscription.example.test/api/session/exchange', {
        method: 'POST',
        body: JSON.stringify({ token: 'invalid' }),
      }),
    );

    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('validates summaries and forwards no browser credentials except the session', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        clientId,
        name: 'Synthetic Client',
        expiresAt: null,
        enabled: true,
        status: 'active',
        placements: [
          {
            id: placementId,
            nodeName: 'Synthetic Node',
            nodeMode: 'wireguard',
            availability: 'available',
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetcher);

    const response = await getSummary(
      authenticatedRequest('/api/subscription'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get('cookie')).toBe('wgep_subscription=session-jwt');
    expect(headers.get('authorization')).toBeNull();
  });

  it('sanitizes malformed and failed upstream responses', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ internal: 'http://panel.internal:3000', token }),
      )
      .mockRejectedValueOnce(new Error(`connect failed ${token}`));
    vi.stubGlobal('fetch', fetcher);

    for (let index = 0; index < 2; index += 1) {
      const response = await getSummary(
        authenticatedRequest('/api/subscription'),
      );
      expect(response.status).toBe(502);
      const body = await response.text();
      expect(body).not.toContain('panel.internal');
      expect(body).not.toContain(token);
    }
  });

  it('streams allowlisted configuration and QR media without caching', async () => {
    const configuration = '[Interface]\nPrivateKey = synthetic\n';
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(configuration, {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': 'attachment; filename="client-node.conf"',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } }),
      );
    vi.stubGlobal('fetch', fetcher);

    const configResponse = await getConfiguration(
      authenticatedRequest(`/api/placements/${placementId}/configuration`),
      { params: Promise.resolve({ placementId }) },
    );
    const qrResponse = await getQrCode(
      authenticatedRequest(`/api/placements/${placementId}/qrcode.svg`),
      { params: Promise.resolve({ placementId }) },
    );

    expect(await configResponse.text()).toBe(configuration);
    expect(configResponse.headers.get('content-disposition')).toBe(
      'attachment; filename="client-node.conf"',
    );
    expect(configResponse.headers.get('cache-control')).toBe(
      'private, no-store',
    );
    expect(await qrResponse.text()).toBe(svg);
    expect(qrResponse.headers.get('content-type')).toContain('image/svg+xml');
  });

  it('clears the browser session for unauthorized responses and logout', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetcher);

    const unauthorized = await getSummary(
      authenticatedRequest('/api/subscription'),
    );
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get('set-cookie')).toContain('Max-Age=0');

    const loggedOut = await logout(authenticatedRequest('/api/session/logout'));
    expect(loggedOut.status).toBe(204);
    expect(loggedOut.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
