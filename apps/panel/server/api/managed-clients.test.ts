import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiTokenService, AuthService } from '@wg-easy-plane/auth';
import type {
  ManagedClient,
  PlacementAdvancedState,
} from '@wg-easy-plane/contracts';
import { openDatabase } from '@wg-easy-plane/database';
import type { DatabaseConnection } from '@wg-easy-plane/database';
import { migrateDatabase } from '@wg-easy-plane/database/migrations';
import type {
  InventorySyncService,
  ManagedClientService,
  NodeService,
} from '@wg-easy-plane/nodes';

import { createApi } from './app';

const TRUSTED_ORIGIN = 'https://panel.example.test';
const temporaryDirectories: string[] = [];
const openConnections: DatabaseConnection[] = [];

function managedClient(): ManagedClient {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    name: 'Synthetic managed client',
    expiresAt: null,
    enabled: true,
    lifecycleStatus: 'active',
    placements: [
      {
        id: '31000000-0000-4000-8000-000000000001',
        nodeId: '32000000-0000-4000-8000-000000000001',
        nodeName: 'Synthetic node',
        nodeMode: 'wireguard',
        remoteClientId: 7,
        status: 'active',
        lastErrorCode: null,
        desiredHydrated: true,
        lastAttemptAt: '2026-09-27T10:00:00.000Z',
        createdAt: '2026-09-27T10:00:00.000Z',
        updatedAt: '2026-09-27T10:00:00.000Z',
      },
    ],
    createdAt: '2026-09-27T10:00:00.000Z',
    updatedAt: '2026-09-27T10:00:00.000Z',
  };
}

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wgep-managed-api-'));
  temporaryDirectories.push(directory);
  const databasePath = path.join(directory, 'panel.sqlite');
  migrateDatabase(databasePath);
  const connection = openDatabase(databasePath);
  openConnections.push(connection);
  const masterKey = Buffer.alloc(32, 71);
  const authService = new AuthService(connection, { masterKey });
  const apiTokenService = new ApiTokenService(connection, { masterKey });
  const value = managedClient();
  const advanced: PlacementAdvancedState = {
    clientId: value.id,
    placementId: value.placements[0]!.id,
    nodeId: value.placements[0]!.nodeId,
    nodeName: value.placements[0]!.nodeName,
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
  const managedClientService = {
    list: vi.fn(() => ({ items: [value], nextCursor: null })),
    get: vi.fn(() => value),
    create: vi.fn(async () => value),
    update: vi.fn(async () => value),
    setEnabled: vi.fn(async () => value),
    delete: vi.fn(async () => ({ deleted: false, client: value })),
    addPlacement: vi.fn(async () => value),
    removePlacement: vi.fn(async () => ({ deleted: false, client: value })),
    retry: vi.fn(async () => ({ deleted: false, client: value })),
    getAdvanced: vi.fn(async () => advanced),
    updateAdvanced: vi.fn(async () => advanced),
    listAmbiguousCandidates: vi.fn(() => []),
    linkCandidate: vi.fn(async () => value),
    cancelAmbiguous: vi.fn(() => ({ deleted: false, client: value })),
  } as unknown as ManagedClientService;
  const runtime = {
    authService,
    apiTokenService,
    nodeService: {} as NodeService,
    inventorySyncService: {} as InventorySyncService,
    managedClientService,
    trustedOrigin: TRUSTED_ORIGIN,
  };
  const api = createApi({ getManagedClientRuntime: () => runtime });
  return { api, apiTokenService, managedClientService };
}

afterEach(() => {
  for (const connection of openConnections.splice(0)) connection.close();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('managed client routes', () => {
  it('enforces read and write PAT scopes and never caches lifecycle responses', async () => {
    const fixture = createFixture();
    const reader = fixture.apiTokenService.create({
      name: 'Synthetic client reader',
      scopes: ['clients:read'],
    });
    const writer = fixture.apiTokenService.create({
      name: 'Synthetic client writer',
      scopes: ['clients:write'],
    });

    const list = await fixture.api.request('/api/v1/clients/managed?limit=20', {
      headers: { Authorization: `Bearer ${reader.token}` },
    });
    expect(list.status).toBe(200);
    expect(list.headers.get('cache-control')).toBe('private, no-store');
    expect(await list.json()).toMatchObject({
      items: [{ name: 'Synthetic managed client' }],
      page: { nextCursor: null },
    });

    const denied = await fixture.api.request('/api/v1/clients/managed', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${reader.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Denied synthetic',
        nodeIds: ['32000000-0000-4000-8000-000000000001'],
      }),
    });
    expect(denied.status).toBe(403);

    const created = await fixture.api.request('/api/v1/clients/managed', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${writer.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Allowed synthetic',
        nodeIds: ['32000000-0000-4000-8000-000000000001'],
      }),
    });
    expect(created.status).toBe(201);
    expect(created.headers.get('cache-control')).toBe('private, no-store');
    expect(fixture.managedClientService.create).toHaveBeenCalledWith({
      name: 'Allowed synthetic',
      nodeIds: ['32000000-0000-4000-8000-000000000001'],
    });

    const readWithWriter = await fixture.api.request(
      '/api/v1/clients/managed?limit=20',
      { headers: { Authorization: `Bearer ${writer.token}` } },
    );
    expect(readWithWriter.status).toBe(403);
  });

  it('scopes strict advanced reads and updates with no-store responses', async () => {
    const fixture = createFixture();
    const reader = fixture.apiTokenService.create({
      name: 'Synthetic advanced reader',
      scopes: ['clients:read'],
    });
    const writer = fixture.apiTokenService.create({
      name: 'Synthetic advanced writer',
      scopes: ['clients:write'],
    });
    const clientId = managedClient().id;
    const placementId = managedClient().placements[0]!.id;
    const url = `/api/v1/clients/managed/${clientId}/placements/${placementId}/advanced`;

    const read = await fixture.api.request(url, {
      headers: { Authorization: `Bearer ${reader.token}` },
    });
    expect(read.status).toBe(200);
    expect(read.headers.get('cache-control')).toBe('private, no-store');
    const state = (await read.json()) as PlacementAdvancedState;
    expect(state.values).toMatchObject({
      ipv4Address: '192.0.2.7',
      jC: null,
    });
    expect(JSON.stringify(state)).not.toMatch(/publicKey|configuration|qr/i);

    const denied = await fixture.api.request(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${reader.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(state.values),
    });
    expect(denied.status).toBe(403);

    const updated = await fixture.api.request(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${writer.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(state.values),
    });
    expect(updated.status).toBe(200);
    expect(updated.headers.get('cache-control')).toBe('private, no-store');
    expect(fixture.managedClientService.updateAdvanced).toHaveBeenCalledWith(
      clientId,
      placementId,
      state.values,
    );

    const unknown = await fixture.api.request(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${writer.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...state.values, DisableCookies: true }),
    });
    expect(unknown.status).toBe(400);
    expect(fixture.managedClientService.updateAdvanced).toHaveBeenCalledTimes(
      1,
    );
  });
});
