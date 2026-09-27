import { describe, expect, it, vi } from 'vitest';

import type { FragmentBrowser } from './subscription-store';
import { SubscriptionStore } from './subscription-store';

const token = `wgep_sub_${'A'.repeat(43)}`;
const summary = {
  clientId: 'f39431bc-cfad-48b1-a56c-14b67db1bd48',
  name: 'Synthetic Client',
  expiresAt: null,
  enabled: true,
  status: 'active',
  placements: [
    {
      id: '2d74ed77-6254-4c91-b18c-4fcb0fe4dbbc',
      nodeName: 'Synthetic Node',
      nodeMode: 'wireguard',
      availability: 'available',
    },
  ],
};

function browser(hash = ''): {
  value: FragmentBrowser;
  replaceState: ReturnType<typeof vi.fn>;
} {
  const replaceState = vi.fn();
  return {
    value: {
      location: { hash, pathname: '/portal', search: '?language=ru' },
      history: { replaceState },
    },
    replaceState,
  };
}

describe('SubscriptionStore', () => {
  it('clears a valid fragment before exchanging and never retains the token', async () => {
    let releaseExchange: ((response: Response) => void) | undefined;
    const pendingExchange = new Promise<Response>((resolve) => {
      releaseExchange = resolve;
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => pendingExchange)
      .mockResolvedValueOnce(Response.json(summary));
    const navigation = browser(`#${token}`);
    const store = new SubscriptionStore(fetcher);

    const initialization = store.initialize(navigation.value);

    expect(navigation.replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/portal?language=ru',
    );
    expect(store.state).toBe('exchanging');
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/session/exchange');
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ token }));

    releaseExchange?.(
      Response.json({ sessionExpiresAt: '2026-09-28T12:00:00.000Z' }),
    );
    await initialization;

    expect(store.state).toBe('ready');
    expect(store.summary).toEqual(summary);
    expect(JSON.stringify(store)).not.toContain(token);
  });

  it('rejects a malformed fragment locally after clearing the URL', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const navigation = browser('#wgep_sub_invalid');
    const store = new SubscriptionStore(fetcher);

    await store.initialize(navigation.value);

    expect(navigation.replaceState).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
    expect(store.state).toBe('unauthorized');
  });

  it('restores an existing HttpOnly session without an exchange', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(summary));
    const store = new SubscriptionStore(fetcher);

    await store.initialize(browser().value);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith('/api/subscription', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    expect(store.state).toBe('ready');
  });

  it('distinguishes revoked sessions from service unavailability', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 502 }));
    const revoked = new SubscriptionStore(fetcher);
    const unavailable = new SubscriptionStore(fetcher);

    await revoked.initialize(browser().value);
    await unavailable.initialize(browser().value);

    expect(revoked.state).toBe('unauthorized');
    expect(unavailable.state).toBe('unavailable');
  });

  it('loads once and clears local state on logout transport failure', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(summary))
      .mockRejectedValueOnce(new Error('offline'));
    const store = new SubscriptionStore(fetcher);
    const navigation = browser();

    await store.initialize(navigation.value);
    await store.initialize(navigation.value);
    await store.logout();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(store.state).toBe('unauthorized');
    expect(store.summary).toBeNull();
  });
});
