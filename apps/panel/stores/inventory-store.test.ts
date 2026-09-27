import { describe, expect, it, vi } from 'vitest';
import type { DiscoveredClient } from '@wg-easy-plane/contracts';

import { InventoryStore } from './inventory-store';

function discovered(nodeId: string, remoteClientId: number): DiscoveredClient {
  return {
    nodeId,
    nodeName: `Synthetic node ${nodeId.at(-1)}`,
    nodeMode: 'wireguard',
    nodeStatus: 'healthy',
    remoteClientId,
    publicData: {
      name: 'Shared synthetic name',
      enabled: true,
      expiresAt: null,
      ipv4Address: `192.0.2.${remoteClientId}`,
      ipv6Address: `2001:db8::${remoteClientId}`,
      latestHandshakeAt: null,
      transferRx: 0,
      transferTx: 0,
      createdAt: '2026-01-02T03:04:05.000Z',
      updatedAt: '2026-02-03T04:05:06.000Z',
    },
    upstreamVersion: '15.4.0',
    firstSeenAt: '2026-09-27T10:00:00.000Z',
    lastSeenAt: '2026-09-27T10:01:00.000Z',
    missingAt: null,
  };
}

describe('InventoryStore', () => {
  it('loads and appends node-scoped same-name clients without persistence', async () => {
    const first = discovered('00000000-0000-4000-8000-000000000001', 7);
    const second = discovered('00000000-0000-4000-8000-000000000002', 7);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          items: [first],
          page: { nextCursor: 'synthetic-cursor' },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ items: [second], page: { nextCursor: null } }),
      );
    const store = new InventoryStore(fetcher);

    await store.load();
    await store.load(false);

    expect(store.items).toEqual([first, second]);
    expect(store.items[0]?.publicData.name).toBe(
      store.items[1]?.publicData.name,
    );
    expect(store.items[0]?.nodeId).not.toBe(store.items[1]?.nodeId);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      '/api/v1/clients/discovered?limit=50&cursor=synthetic-cursor',
      { credentials: 'same-origin' },
    );
    expect(JSON.stringify(store)).not.toContain('password');
    expect(JSON.stringify(store)).not.toContain('Authorization');
  });

  it('maps failed loads to a safe retryable state', async () => {
    const store = new InventoryStore(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 500 })),
    );
    await store.load();
    expect(store.failure).toBe(true);
    store.clearFailure();
    expect(store.failure).toBe(false);
  });
});
