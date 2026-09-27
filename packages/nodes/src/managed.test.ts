import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '@wg-easy-plane/database';
import type { DatabaseConnection } from '@wg-easy-plane/database';
import { migrateDatabase } from '@wg-easy-plane/database/migrations';
import type {
  WgEasyClient,
  WgEasyClientUpdateRequest,
} from '@wg-easy-plane/wg-easy-adapter';

import { ManagedClientService } from './managed';
import { NodeMutationError } from './service';
import { serializeSafeClient } from './sync';

const temporaryDirectories: string[] = [];
const openConnections: DatabaseConnection[] = [];
const NODE_ONE = '10000000-0000-4000-8000-000000000001';
const NODE_TWO = '10000000-0000-4000-8000-000000000002';

function client(id: number, name: string, enabled = true): WgEasyClient {
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
    expiresAt: null,
    allowedIps: ['10.0.0.0/8'],
    serverAllowedIps: ['0.0.0.0/0', '::/0'],
    firewallIps: null,
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
    enabled,
    createdAt: '2026-09-27T10:00:00.000Z',
    updatedAt: '2026-09-27T10:00:00.000Z',
    latestHandshakeAt: null,
    transferRx: null,
    transferTx: null,
  };
}

function insertNode(
  connection: DatabaseConnection,
  id: string,
  name: string,
): void {
  const now = Date.parse('2026-09-27T10:00:00.000Z');
  connection.sqlite
    .prepare(
      `insert into nodes
       (id, name, protocol, host, port, username_ciphertext, password_ciphertext,
        allow_insecure_tls, status, detected_version, mode, last_checked_at,
        last_synced_at, last_error_code, created_at, updated_at)
       values (?, ?, 'https', ?, 51821, 'ciphertext', 'ciphertext', 0,
               'healthy', '15.4.0', 'wireguard', ?, null, null, ?, ?)`,
    )
    .run(
      id,
      name,
      `${name.toLowerCase().replaceAll(' ', '-')}.example.test`,
      now,
      now,
      now,
    );
}

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wgep-managed-'));
  temporaryDirectories.push(directory);
  const databasePath = path.join(directory, 'managed.sqlite');
  migrateDatabase(databasePath);
  const connection = openDatabase(databasePath);
  openConnections.push(connection);
  insertNode(connection, NODE_ONE, 'Synthetic one');
  insertNode(connection, NODE_TWO, 'Synthetic two');

  let sequence = 0;
  let now = new Date('2026-09-27T10:00:00.000Z');
  const snapshots = new Map<string, Map<number, WgEasyClient>>([
    [NODE_ONE, new Map()],
    [NODE_TWO, new Map()],
  ]);
  const createOutcomes: Array<number | Error> = [];
  const deleteOutcomes: Array<'deleted' | 'not_found' | Error> = [];
  const updateOutcomes: Error[] = [];
  const updates: Array<{
    nodeId: string;
    remoteClientId: number;
    input: WgEasyClientUpdateRequest;
  }> = [];
  const toggles: Array<{
    nodeId: string;
    remoteClientId: number;
    enabled: boolean;
  }> = [];

  const remote = {
    async createRemoteClient(
      nodeId: string,
      input: { name: string; expiresAt: string | null },
    ) {
      const outcome = createOutcomes.shift();
      if (outcome instanceof Error) throw outcome;
      if (outcome === undefined) throw new Error('Missing create outcome');
      snapshots.get(nodeId)?.set(outcome, {
        ...client(outcome, input.name),
        expiresAt: input.expiresAt,
      });
      return outcome;
    },
    async updateRemoteClient(
      nodeId: string,
      remoteClientId: number,
      input: WgEasyClientUpdateRequest,
    ) {
      updates.push({ nodeId, remoteClientId, input });
      const outcome = updateOutcomes.shift();
      if (outcome) throw outcome;
      const existing = snapshots.get(nodeId)?.get(remoteClientId);
      if (existing) {
        snapshots.get(nodeId)?.set(remoteClientId, {
          ...existing,
          ...input,
          updatedAt: now.toISOString(),
        });
      }
    },
    async setRemoteClientEnabled(
      nodeId: string,
      remoteClientId: number,
      enabled: boolean,
    ) {
      toggles.push({ nodeId, remoteClientId, enabled });
    },
    async deleteRemoteClient(nodeId: string, remoteClientId: number) {
      const outcome = deleteOutcomes.shift() ?? 'deleted';
      if (outcome instanceof Error) throw outcome;
      snapshots.get(nodeId)?.delete(remoteClientId);
      return outcome;
    },
  };

  const inventory = {
    async syncNode(nodeId: string) {
      const seenAt = now.getTime();
      connection.sqlite
        .prepare('update remote_clients set missing_at = ? where node_id = ?')
        .run(seenAt, nodeId);
      for (const value of snapshots.get(nodeId)?.values() ?? []) {
        const serialized = serializeSafeClient(value);
        connection.sqlite
          .prepare(
            `insert into remote_clients
             (node_id, remote_client_id, name, public_data, snapshot_hash,
              upstream_version, first_seen_at, last_seen_at, missing_at)
             values (?, ?, ?, ?, ?, '15.4.0', ?, ?, null)
             on conflict(node_id, remote_client_id) do update set
               name = excluded.name, public_data = excluded.public_data,
               snapshot_hash = excluded.snapshot_hash,
               last_seen_at = excluded.last_seen_at, missing_at = null`,
          )
          .run(
            nodeId,
            value.id,
            value.name,
            serialized.json,
            serialized.hash,
            seenAt,
            seenAt,
          );
      }
      return {} as never;
    },
  };

  const service = new ManagedClientService(connection, remote, inventory, {
    now: () => now,
    newId: () =>
      `20000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
  });
  return {
    connection,
    createOutcomes,
    deleteOutcomes,
    snapshots,
    service,
    toggles,
    updateOutcomes,
    updates,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
}

afterEach(() => {
  for (const connection of openConnections.splice(0)) connection.close();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('ManagedClientService', () => {
  it('keeps successful placements when another node fails', async () => {
    const fixture = createFixture();
    fixture.createOutcomes.push(11, new NodeMutationError('AUTH_FAILED'));

    const created = await fixture.service.create({
      name: 'Shared synthetic client',
      expiresAt: null,
      nodeIds: [NODE_ONE, NODE_TWO],
    });

    expect(created.placements).toEqual([
      expect.objectContaining({
        nodeId: NODE_ONE,
        remoteClientId: 11,
        status: 'active',
        desiredHydrated: true,
      }),
      expect.objectContaining({
        nodeId: NODE_TWO,
        remoteClientId: null,
        status: 'error',
        lastErrorCode: 'AUTH_FAILED',
      }),
    ]);
    const attempts = fixture.connection.sqlite
      .prepare(
        'select status, error_code from operation_attempts order by started_at, id',
      )
      .all();
    expect(attempts).toEqual([
      { status: 'succeeded', error_code: null },
      { status: 'failed', error_code: 'AUTH_FAILED' },
    ]);
  });

  it('never blindly retries an ambiguous create and requires an explicit link', async () => {
    const fixture = createFixture();
    fixture.snapshots.get(NODE_ONE)?.set(31, client(31, 'Ambiguous synthetic'));
    fixture.createOutcomes.push(new NodeMutationError('TIMEOUT'));
    const created = await fixture.service.create({
      name: 'Ambiguous synthetic',
      nodeIds: [NODE_ONE],
    });
    const placement = created.placements[0];
    expect(placement).toMatchObject({
      status: 'ambiguous',
      remoteClientId: null,
    });

    await expect(
      fixture.service.retry(created.id, placement!.id),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(
      fixture.service.listAmbiguousCandidates(created.id, placement!.id),
    ).toEqual([
      expect.objectContaining({
        remoteClientId: 31,
        name: 'Ambiguous synthetic',
      }),
    ]);

    const linked = await fixture.service.linkCandidate(
      created.id,
      placement!.id,
      31,
    );
    expect(linked.placements[0]).toMatchObject({
      status: 'active',
      remoteClientId: 31,
      desiredHydrated: true,
    });
  });

  it('propagates shared updates and enabled state without losing placement fields', async () => {
    const fixture = createFixture();
    fixture.createOutcomes.push(41);
    const created = await fixture.service.create({
      name: 'Before',
      nodeIds: [NODE_ONE],
    });

    const updated = await fixture.service.update(created.id, {
      name: 'After',
      expiresAt: '2027-01-02T03:04:05.000Z',
    });
    await fixture.service.setEnabled(created.id, false);

    expect(updated.name).toBe('After');
    expect(fixture.updates).toHaveLength(1);
    expect(fixture.updates[0]?.input).toMatchObject({
      name: 'After',
      expiresAt: '2027-01-02T03:04:05.000Z',
      ipv4Address: '192.0.2.41',
      allowedIps: ['10.0.0.0/8'],
    });
    expect(fixture.toggles).toEqual([
      { nodeId: NODE_ONE, remoteClientId: 41, enabled: false },
    ]);
  });

  it('keeps a deletion tombstone until retry and treats remote 404 as success', async () => {
    const fixture = createFixture();
    fixture.createOutcomes.push(51, 52);
    const created = await fixture.service.create({
      name: 'Disposable synthetic',
      nodeIds: [NODE_ONE, NODE_TWO],
    });
    fixture.deleteOutcomes.push(
      new NodeMutationError('UNREACHABLE'),
      'not_found',
    );

    const first = await fixture.service.delete(created.id);
    expect(first).toMatchObject({
      deleted: false,
      client: {
        lifecycleStatus: 'deleting',
        placements: [
          expect.objectContaining({
            status: 'deleting',
            lastErrorCode: 'UNREACHABLE',
          }),
        ],
      },
    });

    fixture.deleteOutcomes.push('not_found');
    const retried = await fixture.service.retry(
      created.id,
      first.client!.placements[0]!.id,
    );
    expect(retried).toEqual({ deleted: true, client: null });
    expect(
      fixture.connection.sqlite
        .prepare('select count(*) as count from managed_clients')
        .get(),
    ).toEqual({ count: 0 });
  });

  it('reads safe complete advanced values and rejects AWG values on WireGuard', async () => {
    const fixture = createFixture();
    fixture.createOutcomes.push(61);
    const created = await fixture.service.create({
      name: 'Advanced synthetic',
      nodeIds: [NODE_ONE],
    });
    const placement = created.placements[0]!;

    const advanced = await fixture.service.getAdvanced(
      created.id,
      placement.id,
    );
    expect(advanced).toMatchObject({
      nodeMode: 'wireguard',
      supportedAwgGeneration: null,
      values: {
        ipv4Address: '192.0.2.61',
        allowedIps: ['10.0.0.0/8'],
        firewallIps: null,
        i1: null,
      },
    });
    expect(JSON.stringify(advanced)).not.toMatch(
      /publicKey|privateKey|presharedKey|configuration|qr/i,
    );

    await expect(
      fixture.service.updateAdvanced(created.id, placement.id, {
        ...advanced.values,
        jC: 5,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(fixture.updates).toHaveLength(0);
  });

  it('retains a complete Amnezia update through failure and exact retry', async () => {
    const fixture = createFixture();
    fixture.connection.sqlite
      .prepare("update nodes set mode = 'amnezia' where id = ?")
      .run(NODE_ONE);
    fixture.createOutcomes.push(71);
    const created = await fixture.service.create({
      name: 'Amnezia synthetic',
      expiresAt: '2027-05-06T07:08:09.000Z',
      nodeIds: [NODE_ONE],
    });
    const placement = created.placements[0]!;
    const current = await fixture.service.getAdvanced(created.id, placement.id);
    const desired = {
      ...current.values,
      allowedIps: null,
      serverAllowedIps: [],
      firewallIps: [],
      dns: null,
      preUp: 'first command\nsecond command',
      jC: 7,
      jMin: 11,
      jMax: 19,
      i1: '<b 0x10>',
      i5: '<c 0x20>',
    };
    fixture.updateOutcomes.push(new NodeMutationError('UNREACHABLE'));

    const failed = await fixture.service.updateAdvanced(
      created.id,
      placement.id,
      desired,
    );
    expect(failed).toMatchObject({
      nodeMode: 'amnezia',
      status: 'error',
      supportedAwgGeneration: 'legacy',
      values: desired,
    });
    const stored = fixture.connection.sqlite
      .prepare('select desired_payload from placements where id = ?')
      .get(placement.id) as { desired_payload: string };
    expect(JSON.parse(stored.desired_payload)).toMatchObject({
      kind: 'complete',
      payload: {
        name: 'Amnezia synthetic',
        enabled: true,
        expiresAt: '2027-05-06T07:08:09.000Z',
        ...desired,
      },
    });

    await fixture.service.retry(created.id, placement.id);
    expect(fixture.updates).toHaveLength(2);
    expect(fixture.updates[1]?.input).toEqual(fixture.updates[0]?.input);
    expect(fixture.service.get(created.id).placements[0]?.status).toBe(
      'active',
    );
  });

  it('marks a shared-only placement missing only after a confirming sync', async () => {
    const fixture = createFixture();
    fixture.createOutcomes.push(81);
    const created = await fixture.service.create({
      name: 'Missing synthetic',
      nodeIds: [NODE_ONE],
    });
    const placement = created.placements[0]!;
    fixture.snapshots.get(NODE_ONE)?.delete(81);
    fixture.connection.sqlite
      .prepare('update placements set desired_payload = ? where id = ?')
      .run(
        JSON.stringify({
          kind: 'shared',
          name: created.name,
          expiresAt: null,
          enabled: true,
        }),
        placement.id,
      );

    await expect(
      fixture.service.getAdvanced(created.id, placement.id),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(fixture.service.get(created.id).placements[0]).toMatchObject({
      status: 'missing',
      lastErrorCode: 'SNAPSHOT_MISSING',
    });
  });
});
