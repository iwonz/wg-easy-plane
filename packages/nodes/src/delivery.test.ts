import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '@wg-easy-plane/database';
import type { DatabaseConnection } from '@wg-easy-plane/database';
import { migrateDatabase } from '@wg-easy-plane/database/migrations';

import { ArtifactDeliveryService, configurationFilename } from './delivery';
import { NodeMutationError } from './service';

const NODE_ID = '10000000-0000-4000-8000-000000000001';
const CLIENT_ID = '20000000-0000-4000-8000-000000000001';
const PLACEMENT_ID = '30000000-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-09-27T10:00:00.000Z');
const temporaryDirectories: string[] = [];
const openConnections: DatabaseConnection[] = [];

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wgep-delivery-'));
  temporaryDirectories.push(directory);
  const databasePath = path.join(directory, 'delivery.sqlite');
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
       values (?, ?, 'https', ?, 443, ?, ?, 0, 'healthy', '15.4.0',
               'wireguard', ?, ?, null, ?, ?)`,
    )
    .run(
      NODE_ID,
      'Synthetic / Node',
      'node.example.test',
      'encrypted-user',
      'encrypted-password',
      NOW,
      NOW,
      NOW,
      NOW,
    );
  connection.sqlite
    .prepare(
      `insert into remote_clients
       (node_id, remote_client_id, name, public_data, snapshot_hash,
        upstream_version, first_seen_at, last_seen_at, missing_at)
       values (?, 7, ?, '{}', 'synthetic-hash', '15.4.0', ?, ?, null)`,
    )
    .run(NODE_ID, 'Synthetic Client', NOW, NOW);
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
  return {
    connection,
    remote,
    service: new ArtifactDeliveryService(connection, remote),
    linkPlacement(status = 'active') {
      connection.sqlite
        .prepare(
          `insert into managed_clients
           (id, name, expires_at, enabled, lifecycle_status, created_at, updated_at)
           values (?, ?, null, 1, 'active', ?, ?)`,
        )
        .run(CLIENT_ID, 'Managed Synthetic', NOW, NOW);
      connection.sqlite
        .prepare(
          `insert into placements
           (id, managed_client_id, node_id, remote_client_id, desired_payload,
            status, last_error_code, last_attempt_at, created_at, updated_at)
           values (?, ?, ?, 7, '{}', ?, null, null, ?, ?)`,
        )
        .run(PLACEMENT_ID, CLIENT_ID, NODE_ID, status, NOW, NOW);
    },
  };
}

function totalChanges(connection: DatabaseConnection): number {
  return (
    connection.sqlite.prepare('select total_changes() as count').get() as {
      count: number;
    }
  ).count;
}

afterEach(() => {
  for (const connection of openConnections.splice(0)) connection.close();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('ArtifactDeliveryService', () => {
  it('delivers current discovered artifacts without changing SQLite', async () => {
    const fixture = createFixture();
    const changes = totalChanges(fixture.connection);

    await expect(
      fixture.service.getDiscoveredConfiguration(NODE_ID, 7),
    ).resolves.toEqual({
      bytes: Uint8Array.from([1, 2, 3]),
      mediaType: 'application/octet-stream',
      filename: 'synthetic-client-synthetic-node.conf',
    });
    await expect(
      fixture.service.getDiscoveredQrCode(NODE_ID, 7),
    ).resolves.toEqual({
      bytes: Uint8Array.from([4, 5, 6]),
      mediaType: 'image/svg+xml',
    });
    expect(totalChanges(fixture.connection)).toBe(changes);
    expect(fixture.remote.getRemoteConfiguration).toHaveBeenCalledWith(
      NODE_ID,
      7,
    );
    expect(fixture.remote.getRemoteQrCode).toHaveBeenCalledWith(NODE_ID, 7);
  });

  it('delivers eligible managed placement artifacts and hides linked discovery', async () => {
    const fixture = createFixture();
    fixture.linkPlacement('drift');

    await expect(
      fixture.service.getManagedConfiguration(CLIENT_ID, PLACEMENT_ID),
    ).resolves.toMatchObject({
      mediaType: 'application/octet-stream',
      filename: 'managed-synthetic-synthetic-node.conf',
    });
    await expect(
      fixture.service.getManagedQrCode(CLIENT_ID, PLACEMENT_ID),
    ).resolves.toMatchObject({ mediaType: 'image/svg+xml' });
    await expect(
      fixture.service.getDiscoveredConfiguration(NODE_ID, 7),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects invalid, missing, and upstream-incompatible targets safely', async () => {
    const fixture = createFixture();
    await expect(
      fixture.service.getDiscoveredConfiguration('invalid', 7),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      fixture.service.getDiscoveredConfiguration(NODE_ID, 999),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    fixture.connection.sqlite
      .prepare(
        'update remote_clients set missing_at = ? where node_id = ? and remote_client_id = 7',
      )
      .run(NOW, NODE_ID);
    await expect(
      fixture.service.getDiscoveredQrCode(NODE_ID, 7),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    fixture.connection.sqlite
      .prepare(
        'update remote_clients set missing_at = null where node_id = ? and remote_client_id = 7',
      )
      .run(NODE_ID);
    fixture.remote.getRemoteConfiguration.mockRejectedValueOnce(
      new NodeMutationError('AUTH_FAILED'),
    );
    await expect(
      fixture.service.getDiscoveredConfiguration(NODE_ID, 7),
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });
});

describe('configurationFilename', () => {
  it('uses only bounded ASCII basename characters and one suffix', () => {
    expect(configurationFilename('../ Клиент\r\n.conf', 'Нода/"unsafe"')).toBe(
      'conf-unsafe.conf',
    );
    expect(configurationFilename('...', '\u0000/')).toBe(
      'wireguard-client.conf',
    );
    const filename = configurationFilename('a'.repeat(200), 'b'.repeat(200));
    expect(filename).toMatch(/^[a-z0-9-]{1,100}\.conf$/);
    expect(filename.length).toBeLessThanOrEqual(105);
  });
});
