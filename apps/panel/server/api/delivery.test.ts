import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiTokenService, AuthService } from '@wg-easy-plane/auth';
import { openDatabase } from '@wg-easy-plane/database';
import type { DatabaseConnection } from '@wg-easy-plane/database';
import { migrateDatabase } from '@wg-easy-plane/database/migrations';
import {
  DeliveryServiceError,
  type ArtifactDeliveryService,
  type InventorySyncService,
  type ManagedClientService,
  type NodeService,
} from '@wg-easy-plane/nodes';

import { createApi } from './app';

const CLIENT_ID = '10000000-0000-4000-8000-000000000001';
const PLACEMENT_ID = '20000000-0000-4000-8000-000000000001';
const NODE_ID = '30000000-0000-4000-8000-000000000001';
const TRUSTED_ORIGIN = 'https://panel.example.test';
const temporaryDirectories: string[] = [];
const openConnections: DatabaseConnection[] = [];

function createFixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wgep-delivery-api-'),
  );
  temporaryDirectories.push(directory);
  const databasePath = path.join(directory, 'panel.sqlite');
  migrateDatabase(databasePath);
  const connection = openDatabase(databasePath);
  openConnections.push(connection);
  const masterKey = Buffer.alloc(32, 73);
  const authService = new AuthService(connection, { masterKey });
  const apiTokenService = new ApiTokenService(connection, { masterKey });
  const artifactDeliveryService = {
    getManagedConfiguration: vi.fn(async () => ({
      bytes: Uint8Array.from([1, 2, 3]),
      mediaType: 'application/octet-stream' as const,
      filename: 'synthetic-client-synthetic-node.conf',
    })),
    getManagedQrCode: vi.fn(async () => ({
      bytes: Uint8Array.from([4, 5, 6]),
      mediaType: 'image/svg+xml' as const,
    })),
    getDiscoveredConfiguration: vi.fn(async () => ({
      bytes: Uint8Array.from([7, 8, 9]),
      mediaType: 'application/octet-stream' as const,
      filename: 'discovered-synthetic-node.conf',
    })),
    getDiscoveredQrCode: vi.fn(async () => ({
      bytes: Uint8Array.from([10, 11, 12]),
      mediaType: 'image/svg+xml' as const,
    })),
  } as unknown as ArtifactDeliveryService;
  const runtime = {
    authService,
    apiTokenService,
    nodeService: {} as NodeService,
    inventorySyncService: {} as InventorySyncService,
    managedClientService: {} as ManagedClientService,
    artifactDeliveryService,
    trustedOrigin: TRUSTED_ORIGIN,
  };
  const api = createApi({ getDeliveryRuntime: () => runtime });
  return { api, apiTokenService, artifactDeliveryService };
}

afterEach(() => {
  for (const connection of openConnections.splice(0)) connection.close();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('delivery routes', () => {
  it('returns private live managed bytes only to clients:read callers', async () => {
    const fixture = createFixture();
    const reader = fixture.apiTokenService.create({
      name: 'Synthetic artifact reader',
      scopes: ['clients:read'],
    });
    const writer = fixture.apiTokenService.create({
      name: 'Synthetic client writer',
      scopes: ['clients:write'],
    });
    const base = `/api/v1/clients/managed/${CLIENT_ID}/placements/${PLACEMENT_ID}`;

    const configuration = await fixture.api.request(`${base}/configuration`, {
      headers: { Authorization: `Bearer ${reader.token}` },
    });
    expect(configuration.status).toBe(200);
    expect(configuration.headers.get('content-type')).toBe(
      'application/octet-stream',
    );
    expect(configuration.headers.get('content-disposition')).toBe(
      'attachment; filename="synthetic-client-synthetic-node.conf"',
    );
    expect(configuration.headers.get('cache-control')).toBe(
      'private, no-store',
    );
    expect(configuration.headers.get('pragma')).toBe('no-cache');
    expect(configuration.headers.get('expires')).toBe('0');
    expect(new Uint8Array(await configuration.arrayBuffer())).toEqual(
      Uint8Array.from([1, 2, 3]),
    );

    const qr = await fixture.api.request(`${base}/qrcode.svg`, {
      headers: { Authorization: `Bearer ${reader.token}` },
    });
    expect(qr.status).toBe(200);
    expect(qr.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8');
    expect(qr.headers.get('content-disposition')).toBeNull();
    expect(qr.headers.get('cache-control')).toBe('private, no-store');
    expect(new Uint8Array(await qr.arrayBuffer())).toEqual(
      Uint8Array.from([4, 5, 6]),
    );

    const denied = await fixture.api.request(`${base}/configuration`, {
      headers: { Authorization: `Bearer ${writer.token}` },
    });
    expect(denied.status).toBe(403);
    expect(
      fixture.artifactDeliveryService.getManagedConfiguration,
    ).toHaveBeenCalledTimes(1);
  });

  it('routes discovered identities and returns safe delivery failures', async () => {
    const fixture = createFixture();
    const reader = fixture.apiTokenService.create({
      name: 'Synthetic discovered reader',
      scopes: ['clients:read'],
    });
    const base = `/api/v1/clients/discovered/${NODE_ID}/7`;

    const configuration = await fixture.api.request(`${base}/configuration`, {
      headers: { Authorization: `Bearer ${reader.token}` },
    });
    expect(configuration.status).toBe(200);
    expect(
      fixture.artifactDeliveryService.getDiscoveredConfiguration,
    ).toHaveBeenCalledWith(NODE_ID, 7);

    const qr = await fixture.api.request(`${base}/qrcode.svg`, {
      headers: { Authorization: `Bearer ${reader.token}` },
    });
    expect(qr.status).toBe(200);
    expect(
      fixture.artifactDeliveryService.getDiscoveredQrCode,
    ).toHaveBeenCalledWith(NODE_ID, 7);

    vi.mocked(
      fixture.artifactDeliveryService.getDiscoveredConfiguration,
    ).mockRejectedValueOnce(new DeliveryServiceError('UPSTREAM_ERROR'));
    const failure = await fixture.api.request(`${base}/configuration`, {
      headers: { Authorization: `Bearer ${reader.token}` },
    });
    expect(failure.status).toBe(502);
    expect(failure.headers.get('cache-control')).toBe('private, no-store');
    const body = JSON.stringify(await failure.json());
    expect(body).toContain('UPSTREAM_ERROR');
    expect(body).not.toMatch(
      /node\.example|authorization|configuration bytes/i,
    );
  });
});
