import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NodeMetadata } from '@wg-easy-plane/contracts';
import { openDatabase } from '@wg-easy-plane/database';
import type { DatabaseConnection } from '@wg-easy-plane/database';
import { migrateDatabase } from '@wg-easy-plane/database/migrations';
import type { WgEasyClient } from '@wg-easy-plane/wg-easy-adapter';

import type { NodeInventoryFetchResult } from './service';
import {
  InventorySyncError,
  InventorySyncScheduler,
  InventorySyncService,
  serializeSafeClient,
  SyncLease,
} from './sync';

const temporaryDirectories: string[] = [];
const openConnections: DatabaseConnection[] = [];
const START = Date.parse('2026-09-27T10:00:00.000Z');

function createConnection(): DatabaseConnection {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wgep-sync-'));
  temporaryDirectories.push(directory);
  const databasePath = path.join(directory, 'sync.sqlite');
  migrateDatabase(databasePath);
  const connection = openDatabase(databasePath);
  openConnections.push(connection);
  return connection;
}

function nodeId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function insertNode(
  connection: DatabaseConnection,
  index: number,
  name = `Synthetic node ${index}`,
): string {
  const id = nodeId(index);
  connection.sqlite
    .prepare(
      `insert into nodes
       (id, name, protocol, host, port, username_ciphertext,
        password_ciphertext, allow_insecure_tls, status, detected_version,
        mode, last_checked_at, last_synced_at, last_error_code,
        created_at, updated_at)
       values (?, ?, 'https', ?, 51821, 'cipher-user', 'cipher-password', 0,
         'healthy', '15.4.0', 'wireguard', ?, null, null, ?, ?)`,
    )
    .run(id, name, `node-${index}.example.test`, START, START, START);
  return id;
}

function client(id: number, name = `Synthetic client ${id}`): WgEasyClient {
  return {
    id,
    userId: 1,
    interfaceId: 'wg0',
    name,
    ipv4Address: `192.0.2.${id}`,
    ipv6Address: `2001:db8::${id}`,
    preUp: '',
    postUp: '',
    preDown: '',
    postDown: '',
    publicKey: `synthetic-public-key-${id}`,
    expiresAt: '2027-01-02T03:04:05.000Z',
    allowedIps: ['0.0.0.0/0', '::/0'],
    serverAllowedIps: [],
    firewallIps: ['192.0.2.0/24'],
    persistentKeepalive: 25,
    mtu: 1420,
    jC: null,
    jMin: null,
    jMax: null,
    i1: null,
    i2: null,
    i3: null,
    i4: null,
    i5: null,
    dns: ['192.0.2.53'],
    serverEndpoint: null,
    enabled: true,
    createdAt: '2026-01-02T03:04:05.000Z',
    updatedAt: '2026-02-03T04:05:06.000Z',
    latestHandshakeAt: '2026-09-27T09:59:00.000Z',
    transferRx: 1024,
    transferTx: 2048,
  };
}

function nodeMetadata(id: string): NodeMetadata {
  return {
    id,
    name: 'Synthetic node',
    protocol: 'https',
    host: 'node.example.test',
    port: 51821,
    allowInsecureTls: false,
    status: 'healthy',
    detectedVersion: '15.4.0',
    mode: 'wireguard',
    lastErrorCode: null,
    lastCheckedAt: new Date(START).toISOString(),
    lastSyncedAt: null,
    createdAt: new Date(START).toISOString(),
    updatedAt: new Date(START).toISOString(),
  };
}

function success(
  id: string,
  clients: WgEasyClient[],
): NodeInventoryFetchResult {
  return {
    ok: true,
    node: nodeMetadata(id),
    clients,
    upstreamVersion: '15.4.0',
  };
}

afterEach(() => {
  for (const connection of openConnections.splice(0)) connection.close();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('InventorySyncService', () => {
  it('reconciles node-scoped identities, missing clients, and reappearance atomically', async () => {
    const connection = createConnection();
    const firstNode = insertNode(connection, 1);
    const secondNode = insertNode(connection, 2);
    let now = START + 1_000;
    const inventories = new Map<string, WgEasyClient[]>([
      [firstNode, [client(7, 'Shared synthetic name')]],
      [secondNode, [client(7, 'Shared synthetic name')]],
    ]);
    let sequence = 0;
    const service = new InventorySyncService(
      connection,
      {
        fetchInventory: async (id) => success(id, inventories.get(id) ?? []),
      },
      {
        now: () => new Date(now),
        newId: () =>
          `10000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
      },
    );

    await service.syncNode(firstNode);
    now += 1_000;
    await service.syncNode(secondNode);
    const firstPage = service.listDiscovered({ limit: 1 });
    const secondPage = service.listDiscovered({
      limit: 1,
      cursor: firstPage.nextCursor ?? undefined,
    });
    const combined = [...firstPage.items, ...secondPage.items];
    expect(combined).toHaveLength(2);
    expect(new Set(combined.map((item) => item.nodeId))).toEqual(
      new Set([firstNode, secondNode]),
    );
    expect(
      combined.every(
        (item) => item.publicData.name === 'Shared synthetic name',
      ),
    ).toBe(true);

    const beforeMissing = combined.find((item) => item.nodeId === firstNode);
    inventories.set(firstNode, []);
    now += 1_000;
    const emptyRun = await service.syncNode(firstNode);
    expect(emptyRun).toMatchObject({
      status: 'succeeded',
      seenCount: 0,
      missingCount: 1,
    });
    expect(
      service
        .listDiscovered({ limit: 20 })
        .items.find((item) => item.nodeId === firstNode)?.missingAt,
    ).toBe(new Date(now).toISOString());

    inventories.set(firstNode, [client(7, 'Shared synthetic name')]);
    now += 1_000;
    await service.syncNode(firstNode);
    const returned = service
      .listDiscovered({ limit: 20 })
      .items.find((item) => item.nodeId === firstNode);
    expect(returned?.missingAt).toBeNull();
    expect(returned?.firstSeenAt).toBe(beforeMissing?.firstSeenAt);
    expect(returned?.lastSeenAt).toBe(new Date(now).toISOString());
    expect(
      connection.sqlite
        .prepare('select last_synced_at from nodes where id = ?')
        .get(firstNode),
    ).toEqual({ last_synced_at: now });
  });

  it('preserves the last safe snapshot and timestamp on safe and unexpected failures', async () => {
    const connection = createConnection();
    const id = insertNode(connection, 1);
    let now = START + 1_000;
    let outcome: NodeInventoryFetchResult | Error = success(id, [client(8)]);
    let sequence = 0;
    const service = new InventorySyncService(
      connection,
      {
        fetchInventory: async () => {
          if (outcome instanceof Error) throw outcome;
          return outcome;
        },
      },
      {
        now: () => new Date(now),
        newId: () =>
          `20000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
      },
    );
    await service.syncNode(id);
    const safeRow = connection.sqlite
      .prepare('select * from remote_clients where node_id = ?')
      .get(id);
    const safeSyncedAt = now;

    now += 1_000;
    outcome = {
      ok: false,
      node: { ...nodeMetadata(id), status: 'unreachable' },
      errorCode: 'TIMEOUT',
    };
    const failed = await service.syncNode(id);
    expect(failed).toMatchObject({ status: 'failed', errorCode: 'TIMEOUT' });
    expect(
      connection.sqlite
        .prepare('select * from remote_clients where node_id = ?')
        .get(id),
    ).toEqual(safeRow);
    expect(
      connection.sqlite
        .prepare('select last_synced_at from nodes where id = ?')
        .get(id),
    ).toEqual({ last_synced_at: safeSyncedAt });

    now += 1_000;
    outcome = new Error('synthetic internal failure with no upstream content');
    await expect(service.syncNode(id)).rejects.toThrow(
      'synthetic internal failure',
    );
    expect(
      connection.sqlite
        .prepare(
          `select status, error_code from sync_runs
           where node_id = ? order by started_at desc limit 1`,
        )
        .get(id),
    ).toEqual({ status: 'failed', error_code: 'INTERNAL_ERROR' });

    now += 1_000;
    outcome = success(id, [
      { ...client(8), unknownSensitiveField: 'rejected' } as WgEasyClient,
    ]);
    await expect(service.syncNode(id)).rejects.toThrow();
    expect(
      connection.sqlite
        .prepare(
          `select status, error_code from sync_runs
           where node_id = ? order by started_at desc limit 1`,
        )
        .get(id),
    ).toEqual({ status: 'failed', error_code: 'INTERNAL_ERROR' });
    expect(
      connection.sqlite
        .prepare(
          'select count(*) as count from remote_clients where node_id = ?',
        )
        .get(id),
    ).toEqual({ count: 1 });
  });

  it('rejects overlapping node runs and recovers a stale running record', async () => {
    const connection = createConnection();
    const id = insertNode(connection, 1);
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchInventory = vi.fn(async () => {
      await gate;
      return success(id, []);
    });
    let sequence = 0;
    const service = new InventorySyncService(
      connection,
      { fetchInventory },
      {
        now: () => new Date(START + 1_000),
        newId: () =>
          `30000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
      },
    );

    connection.sqlite
      .prepare(
        `insert into sync_runs
         (id, node_id, status, error_code, started_at, finished_at)
         values (?, ?, 'running', null, ?, null)`,
      )
      .run('40000000-0000-4000-8000-000000000001', id, START);
    const first = service.syncNode(id);
    await expect(service.syncNode(id)).rejects.toBeInstanceOf(
      InventorySyncError,
    );
    expect(fetchInventory).toHaveBeenCalledTimes(1);
    release?.();
    await first;
    expect(
      connection.sqlite
        .prepare('select status, error_code from sync_runs where id = ?')
        .get('40000000-0000-4000-8000-000000000001'),
    ).toEqual({ status: 'failed', error_code: 'INTERRUPTED' });
  });

  it('serializes deterministic strict snapshots without secret-bearing fields', () => {
    const original = client(9);
    const first = serializeSafeClient(original);
    const second = serializeSafeClient({ ...original });
    expect(second).toEqual(first);
    expect(first.json).not.toContain('oneTimeLink');
    expect(first.json).not.toContain('endpoint');
    expect(first.json).not.toContain('configuration');
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(() =>
      serializeSafeClient({
        ...original,
        unknownSensitiveField: 'nope',
      } as WgEasyClient),
    ).toThrow();
  });
});

describe('SyncLease and InventorySyncScheduler', () => {
  it('allows current-holder refresh and expired takeover without stale release', () => {
    const connection = createConnection();
    let now = START;
    const first = new SyncLease(connection, () => new Date(now));
    const second = new SyncLease(connection, () => new Date(now));
    expect(first.acquire('scheduler', 'holder-a', 1_000)).toBe(true);
    expect(second.acquire('scheduler', 'holder-b', 1_000)).toBe(false);
    expect(first.refresh('scheduler', 'holder-a', 1_000)).toBe(true);
    now += 1_001;
    expect(second.acquire('scheduler', 'holder-b', 1_000)).toBe(true);
    expect(first.refresh('scheduler', 'holder-a', 1_000)).toBe(false);
    first.release('scheduler', 'holder-a');
    expect(second.refresh('scheduler', 'holder-b', 1_000)).toBe(true);
  });

  it('uses one unref timer, can be disabled, and respects a competing lease', async () => {
    const connection = createConnection();
    const firstNode = insertNode(connection, 1);
    const secondNode = insertNode(connection, 2);
    const synced: string[] = [];
    let callback: (() => void) | undefined;
    let unrefCount = 0;
    const scheduler = new InventorySyncScheduler(
      connection,
      {
        syncNode: async (id) => {
          synced.push(id);
          return {} as never;
        },
      },
      {
        intervalSeconds: 300,
        requestTimeoutMs: 10_000,
        holderId: 'scheduler-holder',
        now: () => new Date(START),
        setIntervalFn: (candidate, intervalMs) => {
          expect(intervalMs).toBe(300_000);
          callback = candidate;
          return { unref: () => unrefCount++ } as unknown as ReturnType<
            typeof setInterval
          >;
        },
        clearIntervalFn: () => undefined,
      },
    );
    scheduler.start();
    scheduler.start();
    expect(callback).toBeTypeOf('function');
    expect(unrefCount).toBe(1);
    expect(await scheduler.runCycle()).toBe(true);
    expect(synced).toEqual([firstNode, secondNode]);

    const competing = new SyncLease(connection, () => new Date(START));
    expect(
      competing.acquire('client-inventory-scheduler', 'other-holder', 60_000),
    ).toBe(true);
    expect(await scheduler.runCycle()).toBe(false);
    expect(synced).toHaveLength(2);
    scheduler.stop();

    let disabledTimer = false;
    const disabled = new InventorySyncScheduler(
      connection,
      { syncNode: vi.fn() },
      {
        intervalSeconds: 0,
        requestTimeoutMs: 10_000,
        setIntervalFn: () => {
          disabledTimer = true;
          return {} as unknown as ReturnType<typeof setInterval>;
        },
      },
    );
    disabled.start();
    expect(disabledTimer).toBe(false);
  });

  it('does not overlap scheduled cycles in one process', async () => {
    const connection = createConnection();
    insertNode(connection, 1);
    let release: (() => void) | undefined;
    let started: (() => void) | undefined;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const scheduler = new InventorySyncScheduler(
      connection,
      {
        syncNode: async () => {
          started?.();
          await gate;
          return {} as never;
        },
      },
      {
        intervalSeconds: 0,
        requestTimeoutMs: 10_000,
        holderId: 'non-overlap-holder',
        now: () => new Date(START),
      },
    );

    const active = scheduler.runCycle();
    await startedPromise;
    await expect(scheduler.runCycle()).resolves.toBe(false);
    release?.();
    await expect(active).resolves.toBe(true);
  });
});
