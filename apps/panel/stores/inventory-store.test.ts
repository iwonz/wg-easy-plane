import { describe, expect, it, vi } from 'vitest';
import type {
  DiscoveredClient,
  ManagedClient,
  PlacementAdvancedState,
  PlacementDriftState,
} from '@wg-easy-plane/contracts';

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

function managed(status: 'active' | 'error' = 'active'): ManagedClient {
  return {
    id: '10000000-0000-4000-8000-000000000010',
    name: 'Synthetic managed client',
    expiresAt: null,
    enabled: true,
    lifecycleStatus: 'active',
    placements: [
      {
        id: '10000000-0000-4000-8000-000000000011',
        nodeId: '10000000-0000-4000-8000-000000000012',
        nodeName: 'Synthetic node',
        nodeMode: 'wireguard',
        remoteClientId: status === 'active' ? 7 : null,
        status,
        lastErrorCode: status === 'error' ? 'UPSTREAM_ERROR' : null,
        desiredHydrated: status === 'active',
        lastAttemptAt: '2026-09-27T10:00:00.000Z',
        createdAt: '2026-09-27T10:00:00.000Z',
        updatedAt: '2026-09-27T10:00:00.000Z',
      },
    ],
    createdAt: '2026-09-27T10:00:00.000Z',
    updatedAt: '2026-09-27T10:00:00.000Z',
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

  it('paginates managed clients without browser persistence', async () => {
    const first = managed();
    const second = { ...managed(), id: '10000000-0000-4000-8000-000000000020' };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          items: [first],
          page: { nextCursor: 'managed-cursor' },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ items: [second], page: { nextCursor: null } }),
      );
    const store = new InventoryStore(fetcher);

    await store.loadManaged();
    await store.loadManaged(false);

    expect(store.managedItems).toEqual([first, second]);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      '/api/v1/clients/managed?limit=50&cursor=managed-cursor',
      { credentials: 'same-origin' },
    );
    expect(JSON.stringify(store)).not.toContain('localStorage');
  });

  it('sends lifecycle request shapes and retains partial placement results', async () => {
    const active = managed();
    const partial = managed('error');
    const emptyDiscovered = { items: [], page: { nextCursor: null } };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(active))
      .mockResolvedValueOnce(Response.json(emptyDiscovered))
      .mockResolvedValueOnce(Response.json({ deleted: false, client: partial }))
      .mockResolvedValueOnce(Response.json(emptyDiscovered))
      .mockResolvedValueOnce(
        Response.json({
          items: [
            {
              nodeId: partial.placements[0]!.nodeId,
              remoteClientId: 9,
              name: partial.name,
              enabled: true,
              expiresAt: null,
              lastSeenAt: '2026-09-27T10:00:00.000Z',
            },
          ],
        }),
      );
    const store = new InventoryStore(fetcher);

    expect(
      await store.createManaged({
        name: active.name,
        expiresAt: null,
        nodeIds: [active.placements[0]!.nodeId],
      }),
    ).toBe(true);
    expect(store.managedItems).toEqual([active]);
    expect(
      await store.retryPlacement(active.id, active.placements[0]!.id),
    ).toBe(true);
    expect(store.managedItems).toEqual([partial]);
    await expect(
      store.listCandidates(partial.id, partial.placements[0]!.id),
    ).resolves.toEqual([expect.objectContaining({ remoteClientId: 9 })]);

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      '/api/v1/clients/managed',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({
          name: active.name,
          expiresAt: null,
          nodeIds: [active.placements[0]!.nodeId],
        }),
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      `/api/v1/clients/managed/${active.id}/placements/${active.placements[0]!.id}/retry`,
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
    );
  });

  it('loads and replaces typed advanced state without browser persistence', async () => {
    const active = managed();
    const placement = active.placements[0]!;
    const advanced: PlacementAdvancedState = {
      clientId: active.id,
      placementId: placement.id,
      nodeId: placement.nodeId,
      nodeName: placement.nodeName,
      nodeMode: 'wireguard',
      status: 'active',
      supportedAwgGeneration: null,
      values: {
        ipv4Address: '192.0.2.7',
        ipv6Address: '2001:db8::7',
        preUp: '',
        postUp: '',
        preDown: '',
        postDown: '',
        allowedIps: null,
        serverAllowedIps: ['0.0.0.0/0', '::/0'],
        firewallIps: null,
        mtu: 1420,
        jC: null,
        jMin: null,
        jMax: null,
        i1: null,
        i2: null,
        i3: null,
        i4: null,
        i5: null,
        persistentKeepalive: 25,
        serverEndpoint: null,
        dns: ['192.0.2.53'],
      },
    };
    const changed: PlacementAdvancedState = {
      ...advanced,
      values: {
        ...advanced.values,
        allowedIps: [],
        dns: ['198.51.100.53'],
        mtu: 1380,
      },
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(advanced))
      .mockResolvedValueOnce(Response.json(changed));
    const store = new InventoryStore(fetcher);
    store.managedItems = [active];

    await expect(store.loadAdvanced(active.id, placement.id)).resolves.toEqual(
      advanced,
    );
    await expect(
      store.updateAdvanced(active.id, placement.id, changed.values),
    ).resolves.toBe(true);
    expect(store.advancedState).toEqual(changed);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      `/api/v1/clients/managed/${active.id}/placements/${placement.id}/advanced`,
      { credentials: 'same-origin' },
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      `/api/v1/clients/managed/${active.id}/placements/${placement.id}/advanced`,
      expect.objectContaining({
        method: 'PATCH',
        credentials: 'same-origin',
        body: JSON.stringify(changed.values),
      }),
    );
    expect(JSON.stringify(store.advancedState)).not.toMatch(
      /publicKey|privateKey|configuration|qr/i,
    );
    store.clearAdvanced();
    expect(store.advancedState).toBeNull();
  });

  it('adopts node-scoped selections and resolves safe placement drift', async () => {
    const drifted = managed();
    drifted.placements[0]!.status = 'drift';
    const active = managed();
    const placement = drifted.placements[0]!;
    const values = {
      name: drifted.name,
      enabled: true,
      expiresAt: null,
      ipv4Address: '192.0.2.7',
      ipv6Address: '2001:db8::7',
      preUp: '',
      postUp: '',
      preDown: '',
      postDown: '',
      allowedIps: null,
      serverAllowedIps: ['0.0.0.0/0', '::/0'],
      firewallIps: null,
      mtu: 1420,
      jC: null,
      jMin: null,
      jMax: null,
      i1: null,
      i2: null,
      i3: null,
      i4: null,
      i5: null,
      persistentKeepalive: 25,
      serverEndpoint: null,
      dns: ['192.0.2.53'],
    } satisfies PlacementDriftState['desired'];
    const drift: PlacementDriftState = {
      clientId: drifted.id,
      placementId: placement.id,
      nodeId: placement.nodeId,
      nodeName: placement.nodeName,
      nodeMode: 'wireguard',
      status: 'drift',
      snapshotAt: '2026-09-27T10:00:00.000Z',
      desired: values,
      remote: { ...values, mtu: 1380 },
      differences: [{ field: 'mtu', desired: 1420, remote: 1380 }],
    };
    const emptyDiscovered = { items: [], page: { nextCursor: null } };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(drifted))
      .mockResolvedValueOnce(Response.json(emptyDiscovered))
      .mockResolvedValueOnce(Response.json(drift))
      .mockResolvedValueOnce(Response.json(active))
      .mockResolvedValueOnce(Response.json(emptyDiscovered));
    const store = new InventoryStore(fetcher);
    const adoption = {
      name: drifted.name,
      expiresAt: null,
      enabled: true,
      selections: [
        { nodeId: placement.nodeId, remoteClientId: placement.remoteClientId! },
      ],
    };

    await expect(store.adoptManaged(adoption)).resolves.toBe(true);
    expect(store.managedItems).toEqual([drifted]);
    await expect(store.loadDrift(drifted.id, placement.id)).resolves.toEqual(
      drift,
    );
    expect(store.driftState?.differences).toEqual(drift.differences);
    expect(JSON.stringify(store.driftState)).not.toMatch(
      /publicKey|privateKey|configuration|qr/i,
    );
    await expect(store.reapplyDesired(drifted.id, placement.id)).resolves.toBe(
      true,
    );
    expect(store.managedItems).toEqual([active]);
    expect(store.driftState).toBeNull();
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      '/api/v1/clients/managed/adopt',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(adoption),
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      `/api/v1/clients/managed/${drifted.id}/placements/${placement.id}/drift`,
      { credentials: 'same-origin' },
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      4,
      `/api/v1/clients/managed/${drifted.id}/placements/${placement.id}/reapply-desired`,
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
