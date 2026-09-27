import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '@wg-easy-plane/database';
import type { DatabaseConnection } from '@wg-easy-plane/database';
import { migrateDatabase } from '@wg-easy-plane/database/migrations';

import { ArtifactDeliveryService } from './delivery';
import { SubscriptionReadService } from './subscription';

const NODE_ID = '10000000-0000-4000-8000-000000000001';
const CLIENT_ID = '20000000-0000-4000-8000-000000000001';
const OTHER_CLIENT_ID = '20000000-0000-4000-8000-000000000002';
const PLACEMENT_ID = '30000000-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-09-27T10:00:00.000Z');
const temporaryDirectories: string[] = [];
const openConnections: DatabaseConnection[] = [];

function createFixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wgep-subscription-read-'),
  );
  temporaryDirectories.push(directory);
  const databasePath = path.join(directory, 'subscription-read.sqlite');
  migrateDatabase(databasePath);
  const connection = openDatabase(databasePath);
  openConnections.push(connection);
  connection.sqlite
    .prepare(
      `insert into nodes
       (id, name, protocol, host, port, username_ciphertext,
        password_ciphertext, allow_insecure_tls, status, detected_version,
        mode, last_checked_at, last_synced_at, last_error_code,
        created_at, updated_at)
       values (?, 'Synthetic node', 'https', 'node.example.test', 443,
               'encrypted-user', 'encrypted-password', 0, 'healthy', '15.4.0',
               'wireguard', ?, ?, null, ?, ?)`,
    )
    .run(NODE_ID, NOW, NOW, NOW, NOW);
  connection.sqlite
    .prepare(
      `insert into remote_clients
       (node_id, remote_client_id, name, public_data, snapshot_hash,
        upstream_version, first_seen_at, last_seen_at, missing_at)
       values (?, 7, 'Synthetic client', '{}', 'synthetic-hash',
               '15.4.0', ?, ?, null)`,
    )
    .run(NODE_ID, NOW, NOW);
  connection.sqlite
    .prepare(
      `insert into managed_clients
       (id, name, expires_at, enabled, lifecycle_status, created_at, updated_at)
       values (?, 'Synthetic client', null, 1, 'active', ?, ?),
              (?, 'Other client', null, 1, 'active', ?, ?)`,
    )
    .run(CLIENT_ID, NOW, NOW, OTHER_CLIENT_ID, NOW, NOW);
  connection.sqlite
    .prepare(
      `insert into placements
       (id, managed_client_id, node_id, remote_client_id, desired_payload,
        status, last_error_code, last_attempt_at, created_at, updated_at)
       values (?, ?, ?, 7, '{}', 'active', null, null, ?, ?)`,
    )
    .run(PLACEMENT_ID, CLIENT_ID, NODE_ID, NOW, NOW);
  const remote = {
    getRemoteConfiguration: vi.fn(async () => ({
      bytes: Uint8Array.from([1, 2, 3]),
      mediaType: 'application/octet-stream' as const,
    })),
    getRemoteQrCode: vi.fn(async () => ({
      bytes: Uint8Array.from([4, 5, 6]),
      mediaType: 'image/svg+xml' as const,
    })),
  };
  const delivery = new ArtifactDeliveryService(connection, remote);
  return {
    connection,
    remote,
    service: new SubscriptionReadService(connection, delivery, {
      now: () => new Date(NOW),
    }),
  };
}

afterEach(() => {
  for (const connection of openConnections.splice(0)) connection.close();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('SubscriptionReadService', () => {
  it('returns only safe summary fields and computes availability', () => {
    const fixture = createFixture();
    expect(fixture.service.getSummary(CLIENT_ID)).toEqual({
      clientId: CLIENT_ID,
      name: 'Synthetic client',
      expiresAt: null,
      enabled: true,
      status: 'active',
      placements: [
        {
          id: PLACEMENT_ID,
          nodeName: 'Synthetic node',
          nodeMode: 'wireguard',
          availability: 'available',
        },
      ],
    });
    expect(JSON.stringify(fixture.service.getSummary(CLIENT_ID))).not.toMatch(
      /host|password|remoteClientId|desiredPayload|node\.example/i,
    );

    fixture.connection.sqlite
      .prepare("update nodes set status = 'unreachable' where id = ?")
      .run(NODE_ID);
    expect(
      fixture.service.getSummary(CLIENT_ID).placements[0]?.availability,
    ).toBe('node_unavailable');
    fixture.connection.sqlite
      .prepare("update nodes set status = 'healthy' where id = ?")
      .run(NODE_ID);
    fixture.connection.sqlite
      .prepare("update placements set status = 'missing' where id = ?")
      .run(PLACEMENT_ID);
    expect(
      fixture.service.getSummary(CLIENT_ID).placements[0]?.availability,
    ).toBe('placement_unavailable');
  });

  it('represents disabled, expired, and deleting clients safely', () => {
    const fixture = createFixture();
    fixture.connection.sqlite
      .prepare('update managed_clients set enabled = 0 where id = ?')
      .run(CLIENT_ID);
    expect(fixture.service.getSummary(CLIENT_ID)).toMatchObject({
      status: 'disabled',
      placements: [{ availability: 'client_unavailable' }],
    });
    fixture.connection.sqlite
      .prepare(
        'update managed_clients set enabled = 1, expires_at = ? where id = ?',
      )
      .run(NOW, CLIENT_ID);
    expect(fixture.service.getSummary(CLIENT_ID).status).toBe('expired');
    fixture.connection.sqlite
      .prepare(
        "update managed_clients set lifecycle_status = 'deleting' where id = ?",
      )
      .run(CLIENT_ID);
    expect(fixture.service.getSummary(CLIENT_ID).status).toBe('deleting');
  });

  it('scopes transient artifacts and blocks unavailable clients', async () => {
    const fixture = createFixture();
    const before = (
      fixture.connection.sqlite
        .prepare('select total_changes() as count')
        .get() as { count: number }
    ).count;
    await expect(
      fixture.service.getConfiguration(CLIENT_ID, PLACEMENT_ID),
    ).resolves.toMatchObject({
      bytes: Uint8Array.from([1, 2, 3]),
      mediaType: 'application/octet-stream',
    });
    await expect(
      fixture.service.getQrCode(CLIENT_ID, PLACEMENT_ID),
    ).resolves.toMatchObject({
      bytes: Uint8Array.from([4, 5, 6]),
      mediaType: 'image/svg+xml',
    });
    expect(
      (
        fixture.connection.sqlite
          .prepare('select total_changes() as count')
          .get() as { count: number }
      ).count,
    ).toBe(before);

    await expect(
      fixture.service.getConfiguration(OTHER_CLIENT_ID, PLACEMENT_ID),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    fixture.connection.sqlite
      .prepare('update managed_clients set enabled = 0 where id = ?')
      .run(CLIENT_ID);
    await expect(
      fixture.service.getQrCode(CLIENT_ID, PLACEMENT_ID),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(fixture.remote.getRemoteQrCode).toHaveBeenCalledTimes(1);
  });
});
