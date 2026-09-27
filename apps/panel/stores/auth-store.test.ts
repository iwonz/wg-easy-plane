import { describe, expect, it, vi } from 'vitest';

import { AuthStore } from './auth-store';

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

describe('AuthStore', () => {
  it('selects setup for a fresh installation', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ setupRequired: true }));
    const store = new AuthStore(fetcher);

    await store.initialize();

    expect(store.state).toBe('setup');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('selects login after one failed refresh attempt', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ setupRequired: false }))
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    const store = new AuthStore(fetcher);

    await store.initialize();

    expect(store.state).toBe('login');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('restores an administrator after one successful refresh', async () => {
    const admin = {
      id: '2d74ed77-6254-4c91-b18c-4fcb0fe4dbbc',
      username: 'panel-admin',
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ setupRequired: false }))
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ admin }));
    const store = new AuthStore(fetcher);

    await store.initialize();

    expect(store.state).toBe('authenticated');
    expect(store.admin).toEqual(admin);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('moves from setup to authenticated without retaining the password', async () => {
    const admin = {
      id: '2d74ed77-6254-4c91-b18c-4fcb0fe4dbbc',
      username: 'panel-admin',
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ admin }, 201));
    const store = new AuthStore(fetcher);

    await store.setup('panel-admin', 'synthetic-password-1');

    expect(store.state).toBe('authenticated');
    expect(store.admin).toEqual(admin);
    expect(Object.values(store).join(' ')).not.toContain(
      'synthetic-password-1',
    );
  });

  it('maps safe login and rate-limit failures', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse({}, 429));
    const store = new AuthStore(fetcher);

    await store.login('panel-admin', 'wrong-password');
    expect(store.failure).toBe('invalid-credentials');
    await store.login('panel-admin', 'wrong-password');
    expect(store.failure).toBe('rate-limited');
  });

  it('clears local state even when logout transport fails', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('offline'));
    const store = new AuthStore(fetcher);
    Object.assign(store, {
      state: 'authenticated',
      admin: {
        id: '2d74ed77-6254-4c91-b18c-4fcb0fe4dbbc',
        username: 'panel-admin',
      },
    });

    await store.logout();

    expect(store.state).toBe('login');
    expect(store.admin).toBeNull();
  });
});
