import { describe, expect, it, vi } from 'vitest';
import type { ApiTokenMetadata } from '@wg-easy-plane/contracts';

import { ApiTokenStore } from './api-token-store';

const metadata: ApiTokenMetadata = {
  id: '6d86fb21-65e0-4d3e-8809-a055ecd8c2be',
  name: 'Inventory reader',
  prefix: 'wgep_pat_a1B2c3D4',
  scopes: ['nodes:read'],
  createdAt: '2026-09-27T10:00:00.000Z',
  expiresAt: null,
  lastUsedAt: null,
  revokedAt: null,
};

describe('ApiTokenStore', () => {
  it('loads safe metadata with cursor state', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        items: [metadata],
        page: { nextCursor: 'synthetic-cursor' },
      }),
    );
    const store = new ApiTokenStore(fetcher);

    await store.load();

    expect(store.items).toEqual([metadata]);
    expect(store.nextCursor).toBe('synthetic-cursor');
    expect(store.failure).toBeNull();
  });

  it('holds a created secret only until explicit dismissal', async () => {
    const token = `wgep_pat_${'a'.repeat(43)}`;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ token, metadata }, { status: 201 }));
    const store = new ApiTokenStore(fetcher);

    await expect(
      store.create({
        name: metadata.name,
        scopes: ['nodes:read'],
        expiresAt: null,
      }),
    ).resolves.toBe(true);
    expect(store.created?.token).toBe(token);
    expect(JSON.stringify(store.items)).not.toContain(token);

    store.dismissCreated();
    expect(store.created).toBeNull();
    expect(JSON.stringify(store)).not.toContain(token);
  });

  it('clears a transient secret during component disposal', () => {
    const store = new ApiTokenStore(vi.fn<typeof fetch>());
    store.created = {
      token: `wgep_pat_${'b'.repeat(43)}`,
      metadata,
    };

    store.clearSensitiveState();

    expect(store.created).toBeNull();
  });

  it('maps safe load, create, and revoke failures', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const store = new ApiTokenStore(fetcher);

    await store.load();
    expect(store.failure).toBe('load');
    await store.create({
      name: 'Invalid',
      scopes: ['nodes:read'],
      expiresAt: null,
    });
    expect(store.failure).toBe('create');
    await store.revoke(metadata.id);
    expect(store.failure).toBe('revoke');
  });
});
