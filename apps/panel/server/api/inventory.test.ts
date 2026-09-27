import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiTokenService, AuthService } from '@wg-easy-plane/auth';
import { openDatabase } from '@wg-easy-plane/database';
import type { DatabaseConnection } from '@wg-easy-plane/database';
import { migrateDatabase } from '@wg-easy-plane/database/migrations';
import {
  InventorySyncError,
  InventorySyncService,
  NodeService,
} from '@wg-easy-plane/nodes';
import type {
  WgEasyClient,
  WgEasyConnection,
  WgEasyProbe,
} from '@wg-easy-plane/wg-easy-adapter';
import { WgEasyAdapterError } from '@wg-easy-plane/wg-easy-adapter';

import { createApi } from './app';

const TRUSTED_ORIGIN = 'https://panel.example.test';
const temporaryDirectories: string[] = [];
const openConnections: DatabaseConnection[] = [];

function client(id: number): WgEasyClient {
  return {
    id,
    userId: 1,
    interfaceId: 'wg0',
    name: `Synthetic client ${id}`,
    ipv4Address: `192.0.2.${id}`,
    ipv6Address: `2001:db8::${id}`,
    preUp: '',
    postUp: '',
    preDown: '',
    postDown: '',
    publicKey: `synthetic-public-key-${id}`,
    expiresAt: null,
    allowedIps: ['0.0.0.0/0'],
    serverAllowedIps: [],
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
    enabled: true,
    createdAt: '2026-01-02T03:04:05.000Z',
    updatedAt: '2026-02-03T04:05:06.000Z',
    latestHandshakeAt: null,
    transferRx: 1024,
    transferTx: 2048,
  };
}

function healthyProbe(clients: WgEasyClient[] = []): WgEasyProbe {
  return {
    information: {
      version: '15.4.0',
      mode: 'wireguard',
      upstreamInsecure: false,
      firewallEnabled: true,
      updateAvailable: false,
    },
    clients,
  };
}

function nodeBody() {
  return {
    name: 'Synthetic inventory node',
    protocol: 'https' as const,
    host: 'inventory-node.example.test',
    port: 51821,
    username: 'synthetic-inventory-admin',
    password: 'synthetic-inventory-password',
    allowInsecureTls: false,
  };
}

function createFixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wgep-inventory-api-'),
  );
  temporaryDirectories.push(directory);
  const databasePath = path.join(directory, 'panel.sqlite');
  migrateDatabase(databasePath);
  const connection = openDatabase(databasePath);
  openConnections.push(connection);
  let now = new Date('2026-09-27T10:00:00.000Z');
  let nodeSequence = 0;
  let runSequence = 0;
  let randomByte = 22;
  const outcomes: (WgEasyProbe | Error)[] = [];
  const calls: WgEasyConnection[] = [];
  const masterKey = Buffer.alloc(32, 61);
  const authService = new AuthService(connection, {
    masterKey,
    now: () => now,
  });
  const apiTokenService = new ApiTokenService(connection, {
    masterKey,
    now: () => now,
    randomBytes: (size) => Buffer.alloc(size, randomByte++),
  });
  const nodeService = new NodeService(connection, {
    masterKey,
    now: () => now,
    newId: () =>
      `00000000-0000-4000-8000-${String(++nodeSequence).padStart(12, '0')}`,
    randomBytes: (size) => Buffer.alloc(size, randomByte++),
    adapterFactory: (input) => ({
      async probe() {
        calls.push(input);
        const outcome = outcomes.shift();
        if (!outcome) throw new Error('Missing synthetic probe');
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
    }),
  });
  const inventorySyncService = new InventorySyncService(
    connection,
    nodeService,
    {
      now: () => now,
      newId: () =>
        `10000000-0000-4000-8000-${String(++runSequence).padStart(12, '0')}`,
    },
  );
  const runtime = {
    authService,
    apiTokenService,
    nodeService,
    inventorySyncService,
    trustedOrigin: TRUSTED_ORIGIN,
  };
  const api = createApi({
    getAuthRuntime: () => runtime,
    getApiTokenRuntime: () => runtime,
    getNodeRuntime: () => runtime,
    getInventoryRuntime: () => runtime,
  });
  return {
    api,
    apiTokenService,
    calls,
    connection,
    inventorySyncService,
    nodeService,
    outcomes,
    async accessCookie() {
      const session = await authService.setup({
        username: 'inventory-admin',
        password: 'synthetic-password-1',
      });
      return `wgep_access=${session.tokens.accessToken}`;
    },
    advance(milliseconds: number) {
      now = new Date(now.getTime() + milliseconds);
    },
  };
}

afterEach(() => {
  for (const connection of openConnections.splice(0)) connection.close();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('inventory routes', () => {
  it('synchronizes after healthy API creation and returns refreshed node metadata', async () => {
    const fixture = createFixture();
    const cookie = await fixture.accessCookie();
    fixture.outcomes.push(healthyProbe(), healthyProbe([client(7)]));

    const response = await fixture.api.request('/api/v1/nodes', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: TRUSTED_ORIGIN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(nodeBody()),
    });
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      status: 'healthy',
      lastSyncedAt: '2026-09-27T10:00:00.000Z',
    });
    expect(fixture.calls).toHaveLength(2);
    expect(
      fixture.connection.sqlite
        .prepare('select count(*) as count from remote_clients')
        .get(),
    ).toEqual({ count: 1 });
  });

  it('enforces manual-sync and discovered-read scopes with no-store responses', async () => {
    const fixture = createFixture();
    fixture.outcomes.push(healthyProbe());
    const node = await fixture.nodeService.create(nodeBody());
    const nodeReader = fixture.apiTokenService.create({
      name: 'Node reader',
      scopes: ['nodes:read'],
    });
    const nodeWriter = fixture.apiTokenService.create({
      name: 'Node writer',
      scopes: ['nodes:write'],
    });
    const clientReader = fixture.apiTokenService.create({
      name: 'Client reader',
      scopes: ['clients:read'],
    });

    const deniedSync = await fixture.api.request(
      `/api/v1/nodes/${node.id}/sync`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${nodeReader.token}` },
      },
    );
    expect(deniedSync.status).toBe(403);
    expect(fixture.calls).toHaveLength(1);

    const cookie = await fixture.accessCookie();
    const originDenied = await fixture.api.request(
      `/api/v1/nodes/${node.id}/sync`,
      { method: 'POST', headers: { Cookie: cookie } },
    );
    expect(originDenied.status).toBe(403);

    const missing = await fixture.api.request(
      '/api/v1/nodes/00000000-0000-4000-8000-999999999999/sync',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${nodeWriter.token}` },
      },
    );
    expect(missing.status).toBe(404);

    fixture.advance(1_000);
    fixture.outcomes.push(healthyProbe([client(7), client(8)]));
    const synced = await fixture.api.request(`/api/v1/nodes/${node.id}/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${nodeWriter.token}` },
    });
    expect(synced.status).toBe(200);
    expect(synced.headers.get('cache-control')).toBe('private, no-store');
    expect(await synced.json()).toMatchObject({
      status: 'succeeded',
      seenCount: 2,
      missingCount: 0,
      errorCode: null,
    });

    vi.spyOn(fixture.inventorySyncService, 'syncNode').mockRejectedValueOnce(
      new InventorySyncError('BUSY'),
    );
    const busy = await fixture.api.request(`/api/v1/nodes/${node.id}/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${nodeWriter.token}` },
    });
    expect(busy.status).toBe(409);

    const deniedList = await fixture.api.request(
      '/api/v1/clients/discovered?limit=1',
      { headers: { Authorization: `Bearer ${nodeReader.token}` } },
    );
    expect(deniedList.status).toBe(403);

    const firstPage = await fixture.api.request(
      '/api/v1/clients/discovered?limit=1',
      { headers: { Authorization: `Bearer ${clientReader.token}` } },
    );
    const firstBody = (await firstPage.json()) as {
      items: unknown[];
      page: { nextCursor: string };
    };
    expect(firstPage.status).toBe(200);
    expect(firstPage.headers.get('cache-control')).toBe('private, no-store');
    expect(firstBody.items).toHaveLength(1);
    expect(firstBody.page.nextCursor).toBeTruthy();
    const serialized = JSON.stringify(firstBody);
    expect(serialized).not.toContain('synthetic-inventory-password');
    expect(serialized).not.toContain('publicKey');
    expect(serialized).not.toContain('serverEndpoint');

    const secondPage = await fixture.api.request(
      `/api/v1/clients/discovered?limit=1&cursor=${encodeURIComponent(firstBody.page.nextCursor)}`,
      { headers: { Authorization: `Bearer ${clientReader.token}` } },
    );
    expect(secondPage.status).toBe(200);
    expect((await secondPage.json()) as { items: unknown[] }).toMatchObject({
      items: [{}],
    });

    const invalidCursor = await fixture.api.request(
      '/api/v1/clients/discovered?cursor=not-a-cursor',
      { headers: { Authorization: `Bearer ${clientReader.token}` } },
    );
    expect(invalidCursor.status).toBe(400);

    fixture.advance(1_000);
    fixture.outcomes.push(
      new WgEasyAdapterError({ code: 'TIMEOUT', operation: 'information' }),
    );
    const failedSync = await fixture.api.request(
      `/api/v1/nodes/${node.id}/sync`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${nodeWriter.token}` },
      },
    );
    expect(await failedSync.json()).toMatchObject({
      status: 'failed',
      errorCode: 'TIMEOUT',
    });
    const staleList = await fixture.api.request(
      '/api/v1/clients/discovered?limit=20',
      { headers: { Authorization: `Bearer ${clientReader.token}` } },
    );
    const staleBody = (await staleList.json()) as {
      items: { nodeStatus: string; missingAt: string | null }[];
    };
    expect(staleBody.items).toHaveLength(2);
    expect(staleBody.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeStatus: 'unreachable', missingAt: null }),
      ]),
    );
  });
});
