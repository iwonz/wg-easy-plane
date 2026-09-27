import { describe, expect, it, vi } from 'vitest';
import type { NodeMetadata } from '@wg-easy-plane/contracts';

import { NodeStore } from './node-store';

const node: NodeMetadata = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Synthetic node',
  protocol: 'https',
  host: 'node.example.test',
  port: 51821,
  status: 'healthy',
  detectedVersion: '15.4.0',
  mode: 'wireguard',
  lastErrorCode: null,
  lastCheckedAt: '2026-09-27T10:00:00.000Z',
  lastSyncedAt: null,
  createdAt: '2026-09-27T10:00:00.000Z',
  updatedAt: '2026-09-27T10:00:00.000Z',
};

const connection = {
  protocol: 'https' as const,
  host: 'node.example.test',
  port: 51821,
  username: 'synthetic-admin',
  password: 'synthetic-password',
};

describe('NodeStore', () => {
  it('loads safe metadata with cursor state', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        items: [node],
        page: { nextCursor: 'synthetic-cursor' },
      }),
    );
    const store = new NodeStore(fetcher);

    await store.load();

    expect(store.items).toEqual([node]);
    expect(store.nextCursor).toBe('synthetic-cursor');
    expect(fetcher).toHaveBeenCalledWith('/api/v1/nodes?limit=50', {
      credentials: 'same-origin',
    });
  });

  it('sends credentials only in a create body and does not retain them', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(node, { status: 201 }));
    const store = new NodeStore(fetcher);

    await expect(
      store.create({ name: node.name, ...connection }),
    ).resolves.toBe(true);

    expect(fetcher).toHaveBeenCalledWith(
      '/api/v1/nodes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: node.name, ...connection }),
      }),
    );
    expect(JSON.stringify(store)).not.toContain(connection.username);
    expect(JSON.stringify(store)).not.toContain(connection.password);
    expect(store.items).toEqual([node]);
  });

  it('tests unsaved settings without placing credentials in the URL or state', async () => {
    const result = {
      status: 'auth_failed',
      detectedVersion: null,
      mode: null,
      lastErrorCode: 'AUTH_FAILED',
      lastCheckedAt: '2026-09-27T10:00:00.000Z',
    } as const;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(result));
    const store = new NodeStore(fetcher);

    await expect(store.testConnection(connection)).resolves.toBe(true);

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/nodes/test');
    expect(String(url)).not.toContain(connection.username);
    expect(String(url)).not.toContain(connection.password);
    expect(init?.body).toBe(JSON.stringify(connection));
    expect(store.lastTestResult).toEqual(result);
    expect(JSON.stringify(store)).not.toContain(connection.password);
  });

  it('updates, retests, synchronizes, and deletes safe node metadata', async () => {
    const renamed = { ...node, name: 'Renamed node' };
    const unreachable = {
      ...renamed,
      status: 'unreachable' as const,
      lastErrorCode: 'TIMEOUT' as const,
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(renamed))
      .mockResolvedValueOnce(Response.json(unreachable))
      .mockResolvedValueOnce(
        Response.json({
          id: '10000000-0000-4000-8000-000000000001',
          nodeId: node.id,
          status: 'succeeded',
          seenCount: 1,
          missingCount: 0,
          errorCode: null,
          startedAt: '2026-09-27T10:01:00.000Z',
          finishedAt: '2026-09-27T10:01:01.000Z',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          ...unreachable,
          status: 'healthy',
          lastErrorCode: null,
          lastSyncedAt: '2026-09-27T10:01:01.000Z',
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const store = new NodeStore(fetcher);
    store.items = [node];

    await expect(store.update(node.id, { name: renamed.name })).resolves.toBe(
      true,
    );
    expect(store.items[0]?.name).toBe(renamed.name);
    await expect(store.retest(node.id)).resolves.toBe(true);
    expect(store.items[0]?.status).toBe('unreachable');
    await expect(store.sync(node.id)).resolves.toBe(true);
    expect(store.items[0]?.lastSyncedAt).toBe('2026-09-27T10:01:01.000Z');
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      `/api/v1/nodes/${node.id}/sync`,
      {
        method: 'POST',
        credentials: 'same-origin',
      },
    );
    await expect(store.delete(node.id)).resolves.toBe(true);
    expect(store.items).toHaveLength(0);
  });

  it('maps each operation to a safe failure state', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 500 }));
    const store = new NodeStore(fetcher);

    await store.load();
    expect(store.failure).toBe('load');
    await store.create({ name: node.name, ...connection });
    expect(store.failure).toBe('create');
    await store.update(node.id, { name: 'Renamed' });
    expect(store.failure).toBe('update');
    await store.testConnection(connection);
    expect(store.failure).toBe('test');
    await store.sync(node.id);
    expect(store.failure).toBe('sync');
    await store.delete(node.id);
    expect(store.failure).toBe('delete');
  });
});
