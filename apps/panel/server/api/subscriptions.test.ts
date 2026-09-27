import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiTokenService,
  AuthService,
  SubscriptionService,
} from '@wg-easy-plane/auth';
import { openDatabase } from '@wg-easy-plane/database';
import type { DatabaseConnection } from '@wg-easy-plane/database';
import { migrateDatabase } from '@wg-easy-plane/database/migrations';
import type {
  ArtifactDeliveryService,
  InventorySyncService,
  ManagedClientService,
  NodeService,
  SubscriptionReadService,
} from '@wg-easy-plane/nodes';

import { createApi } from './app';

const CLIENT_ID = '10000000-0000-4000-8000-000000000001';
const PLACEMENT_ID = '20000000-0000-4000-8000-000000000001';
const TRUSTED_ORIGIN = 'https://panel.example.test';
const temporaryDirectories: string[] = [];
const openConnections: DatabaseConnection[] = [];

function createFixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wgep-subscription-api-'),
  );
  temporaryDirectories.push(directory);
  const databasePath = path.join(directory, 'panel.sqlite');
  migrateDatabase(databasePath);
  const connection = openDatabase(databasePath);
  openConnections.push(connection);
  const now = new Date('2026-09-27T10:00:00.000Z');
  connection.sqlite
    .prepare(
      `insert into managed_clients
       (id, name, expires_at, enabled, lifecycle_status, created_at, updated_at)
       values (?, 'Synthetic subscriber', null, 1, 'active', ?, ?)`,
    )
    .run(CLIENT_ID, now.getTime(), now.getTime());
  const masterKey = Buffer.alloc(32, 83);
  const authService = new AuthService(connection, { masterKey });
  const apiTokenService = new ApiTokenService(connection, { masterKey });
  const subscriptionService = new SubscriptionService(connection, {
    masterKey,
    subscriptionPublicUrl: new URL('https://subscription.example.test'),
    now: () => now,
  });
  const subscriptionReadService = {
    getSummary: vi.fn(() => ({
      clientId: CLIENT_ID,
      name: 'Synthetic subscriber',
      expiresAt: null,
      enabled: true,
      status: 'active' as const,
      placements: [
        {
          id: PLACEMENT_ID,
          nodeName: 'Synthetic node',
          nodeMode: 'wireguard' as const,
          availability: 'available' as const,
        },
      ],
    })),
    getConfiguration: vi.fn(async () => ({
      bytes: Uint8Array.from([1, 2, 3]),
      mediaType: 'application/octet-stream' as const,
      filename: 'synthetic-subscriber-synthetic-node.conf',
    })),
    getQrCode: vi.fn(async () => ({
      bytes: Uint8Array.from([4, 5, 6]),
      mediaType: 'image/svg+xml' as const,
    })),
  } as unknown as SubscriptionReadService;
  const runtime = {
    authService,
    apiTokenService,
    subscriptionService,
    subscriptionReadService,
    nodeService: {} as NodeService,
    inventorySyncService: {} as InventorySyncService,
    managedClientService: {} as ManagedClientService,
    artifactDeliveryService: {} as ArtifactDeliveryService,
    trustedOrigin: TRUSTED_ORIGIN,
  };
  const api = createApi({ getSubscriptionRuntime: () => runtime });
  return {
    api,
    apiTokenService,
    subscriptionReadService,
  };
}

function sessionCookie(response: Response): string {
  const header = response.headers.get('set-cookie');
  if (!header) throw new Error('Expected subscription session cookie');
  const cookie = header.split(';', 1)[0];
  if (!cookie) throw new Error('Expected subscription cookie value');
  return cookie;
}

function fragmentToken(url: string): string {
  return new URL(url).hash.slice(1);
}

afterEach(() => {
  for (const connection of openConnections.splice(0)) connection.close();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('subscription access routes', () => {
  it('enforces PAT scopes and exchanges only fragment tokens for cookies', async () => {
    const fixture = createFixture();
    const reader = fixture.apiTokenService.create({
      name: 'Subscription reader',
      scopes: ['subscriptions:read'],
    });
    const writer = fixture.apiTokenService.create({
      name: 'Subscription writer',
      scopes: ['subscriptions:write'],
    });
    const base = `/api/v1/clients/managed/${CLIENT_ID}/subscription`;

    const initial = await fixture.api.request(base, {
      headers: { Authorization: `Bearer ${reader.token}` },
    });
    expect(initial.status).toBe(200);
    expect(await initial.json()).toMatchObject({
      clientId: CLIENT_ID,
      status: 'missing',
      url: null,
    });
    expect(initial.headers.get('cache-control')).toBe('private, no-store');

    const denied = await fixture.api.request(base, {
      method: 'POST',
      headers: { Authorization: `Bearer ${reader.token}` },
    });
    expect(denied.status).toBe(403);

    const rotated = await fixture.api.request(base, {
      method: 'POST',
      headers: { Authorization: `Bearer ${writer.token}` },
    });
    expect(rotated.status).toBe(200);
    const link = (await rotated.json()) as { url: string; version: number };
    const rawToken = fragmentToken(link.url);
    expect(rawToken).toMatch(/^wgep_sub_[A-Za-z0-9_-]{43}$/);
    expect(link.version).toBe(1);

    const exchange = await fixture.api.request(
      '/api/v1/subscriptions/exchange',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: rawToken }),
      },
    );
    expect(exchange.status).toBe(200);
    expect(exchange.headers.get('cache-control')).toBe('private, no-store');
    expect(exchange.headers.get('set-cookie')).toMatch(
      /^wgep_subscription=.*HttpOnly.*Secure.*SameSite=Lax/i,
    );
    const exchangeBody = JSON.stringify(await exchange.json());
    expect(exchangeBody).toContain('sessionExpiresAt');
    expect(exchangeBody).not.toContain(rawToken);
    expect(exchangeBody).not.toContain('eyJ');

    const invalid = `wgep_sub_${'z'.repeat(43)}`;
    const rejected = await fixture.api.request(
      '/api/v1/subscriptions/exchange',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: invalid }),
      },
    );
    expect(rejected.status).toBe(401);
    expect(JSON.stringify(await rejected.json())).not.toContain(invalid);
  });

  it('serves scoped read-only state and invalidates sessions on rotate/revoke', async () => {
    const fixture = createFixture();
    const writer = fixture.apiTokenService.create({
      name: 'Subscription writer',
      scopes: ['subscriptions:write'],
    });
    const base = `/api/v1/clients/managed/${CLIENT_ID}/subscription`;
    const rotate = async () => {
      const response = await fixture.api.request(base, {
        method: 'POST',
        headers: { Authorization: `Bearer ${writer.token}` },
      });
      const body = (await response.json()) as { url: string };
      const exchange = await fixture.api.request(
        '/api/v1/subscriptions/exchange',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: fragmentToken(body.url) }),
        },
      );
      return sessionCookie(exchange);
    };

    const firstCookie = await rotate();
    const summary = await fixture.api.request('/api/v1/subscriptions/client', {
      headers: { Cookie: firstCookie },
    });
    expect(summary.status).toBe(200);
    expect(await summary.json()).toMatchObject({
      clientId: CLIENT_ID,
      placements: [{ id: PLACEMENT_ID, availability: 'available' }],
    });
    expect(fixture.subscriptionReadService.getSummary).toHaveBeenCalledWith(
      CLIENT_ID,
    );

    const configuration = await fixture.api.request(
      `/api/v1/subscriptions/placements/${PLACEMENT_ID}/configuration`,
      { headers: { Cookie: firstCookie } },
    );
    expect(configuration.status).toBe(200);
    expect(configuration.headers.get('cache-control')).toBe(
      'private, no-store',
    );
    expect(configuration.headers.get('content-disposition')).toBe(
      'attachment; filename="synthetic-subscriber-synthetic-node.conf"',
    );
    expect(new Uint8Array(await configuration.arrayBuffer())).toEqual(
      Uint8Array.from([1, 2, 3]),
    );
    const qr = await fixture.api.request(
      `/api/v1/subscriptions/placements/${PLACEMENT_ID}/qrcode.svg`,
      { headers: { Cookie: firstCookie } },
    );
    expect(qr.status).toBe(200);
    expect(new Uint8Array(await qr.arrayBuffer())).toEqual(
      Uint8Array.from([4, 5, 6]),
    );

    const patIsNotASession = await fixture.api.request(
      '/api/v1/subscriptions/client',
      { headers: { Authorization: `Bearer ${writer.token}` } },
    );
    expect(patIsNotASession.status).toBe(401);

    const secondCookie = await rotate();
    const invalidatedByRotate = await fixture.api.request(
      '/api/v1/subscriptions/client',
      { headers: { Cookie: firstCookie } },
    );
    expect(invalidatedByRotate.status).toBe(401);
    expect(invalidatedByRotate.headers.get('set-cookie')).toContain(
      'wgep_subscription=',
    );

    const revoked = await fixture.api.request(base, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${writer.token}` },
    });
    expect(revoked.status).toBe(204);
    const invalidatedByRevoke = await fixture.api.request(
      '/api/v1/subscriptions/client',
      { headers: { Cookie: secondCookie } },
    );
    expect(invalidatedByRevoke.status).toBe(401);
  });
});
