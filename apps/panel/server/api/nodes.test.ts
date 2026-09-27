import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiTokenService, AuthService } from '@wg-easy-plane/auth';
import { openDatabase } from '@wg-easy-plane/database';
import type { DatabaseConnection } from '@wg-easy-plane/database';
import { migrateDatabase } from '@wg-easy-plane/database/migrations';
import { NodeService } from '@wg-easy-plane/nodes';
import {
  WgEasyAdapterError,
  type WgEasyConnection,
  type WgEasyProbe,
} from '@wg-easy-plane/wg-easy-adapter';

import { createApi } from './app';

const TRUSTED_ORIGIN = 'https://panel.example.test';
const temporaryDirectories: string[] = [];
const openConnections: DatabaseConnection[] = [];

function healthyProbe(
  mode: 'wireguard' | 'amnezia' = 'wireguard',
): WgEasyProbe {
  return {
    information: {
      version: '15.4.0',
      mode,
      upstreamInsecure: false,
      firewallEnabled: true,
      updateAvailable: false,
    },
    clients: [],
  };
}

function nodeBody(index = 1) {
  return {
    name: `Synthetic node ${index}`,
    protocol: 'https',
    host: `node-${index}.example.test`,
    port: 51821,
    username: `synthetic-admin-${index}`,
    password: `synthetic-password-${index}`,
    allowInsecureTls: false,
  };
}

function connectionBody(index = 1) {
  const node = nodeBody(index);
  return {
    protocol: node.protocol,
    host: node.host,
    port: node.port,
    username: node.username,
    password: node.password,
    allowInsecureTls: node.allowInsecureTls,
  };
}

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wgep-node-api-'));
  temporaryDirectories.push(directory);
  const databasePath = path.join(directory, 'panel.sqlite');
  migrateDatabase(databasePath);
  const connection = openDatabase(databasePath);
  openConnections.push(connection);
  let now = new Date('2026-09-27T10:00:00.000Z');
  let randomByte = 1;
  let nodeSequence = 0;
  const masterKey = Buffer.alloc(32, 37);
  const calls: WgEasyConnection[] = [];
  const outcomes: (WgEasyProbe | Error)[] = [];
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
        if (!outcome) throw new Error('Missing synthetic probe outcome');
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
    }),
  });
  const runtime = {
    authService,
    apiTokenService,
    nodeService,
    trustedOrigin: TRUSTED_ORIGIN,
  };
  const api = createApi({
    getAuthRuntime: () => runtime,
    getApiTokenRuntime: () => runtime,
    getNodeRuntime: () => runtime,
  });

  return {
    api,
    apiTokenService,
    calls,
    connection,
    outcomes,
    async accessCookie() {
      const session = await authService.setup({
        username: 'panel-admin',
        password: 'synthetic-password-1',
      });
      return `wgep_access=${session.tokens.accessToken}`;
    },
    advance(milliseconds: number) {
      now = new Date(now.getTime() + milliseconds);
    },
  };
}

function jsonMutation(
  body: unknown,
  options: { cookie?: string; bearer?: string; origin?: string | null } = {},
): RequestInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.bearer) headers.Authorization = `Bearer ${options.bearer}`;
  if (options.origin !== null) {
    headers.Origin = options.origin ?? TRUSTED_ORIGIN;
  }
  return { method: 'POST', headers, body: JSON.stringify(body) };
}

afterEach(() => {
  for (const connection of openConnections.splice(0)) connection.close();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('node routes', () => {
  it('creates, lists, and reads only safe metadata with no-store responses', async () => {
    const fixture = createFixture();
    const cookie = await fixture.accessCookie();
    fixture.outcomes.push(healthyProbe('amnezia'));

    const createdResponse = await fixture.api.request(
      '/api/v1/nodes',
      jsonMutation(nodeBody(), { cookie }),
    );
    const created = (await createdResponse.json()) as { id: string };
    const createdText = JSON.stringify(created);

    expect(createdResponse.status).toBe(201);
    expect(createdResponse.headers.get('cache-control')).toBe(
      'private, no-store',
    );
    expect(created).toMatchObject({
      status: 'healthy',
      detectedVersion: '15.4.0',
      mode: 'amnezia',
    });
    expect(createdText).not.toContain('synthetic-admin');
    expect(createdText).not.toContain('synthetic-password');
    expect(createdText).not.toContain('ciphertext');

    const listedResponse = await fixture.api.request('/api/v1/nodes?limit=20', {
      headers: { Cookie: cookie },
    });
    const listed = await listedResponse.json();
    expect(listedResponse.status).toBe(200);
    expect(listed).toMatchObject({
      items: [{ id: created.id, name: 'Synthetic node 1' }],
      page: { nextCursor: null },
    });
    expect(JSON.stringify(listed)).not.toContain('synthetic-password');

    const detail = await fixture.api.request(`/api/v1/nodes/${created.id}`, {
      headers: { Cookie: cookie },
    });
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ id: created.id });
  });

  it('tests unsaved failures without persistence or raw upstream details', async () => {
    const fixture = createFixture();
    const cookie = await fixture.accessCookie();
    fixture.outcomes.push(
      new WgEasyAdapterError({
        code: 'AUTH_FAILED',
        operation: 'list_clients',
        httpStatus: 401,
      }),
    );

    const response = await fixture.api.request(
      '/api/v1/nodes/test',
      jsonMutation(connectionBody(), { cookie }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'auth_failed',
      lastErrorCode: 'AUTH_FAILED',
      detectedVersion: null,
      mode: null,
    });
    expect(JSON.stringify(body)).not.toContain('synthetic-password');
    expect(
      fixture.connection.sqlite
        .prepare('select count(*) as count from nodes')
        .get(),
    ).toEqual({ count: 0 });
  });

  it('enforces exact PAT scopes and browser Origin before probing', async () => {
    const fixture = createFixture();
    const reader = fixture.apiTokenService.create({
      name: 'Node reader',
      scopes: ['nodes:read'],
    });
    const writer = fixture.apiTokenService.create({
      name: 'Node writer',
      scopes: ['nodes:write'],
    });

    const list = await fixture.api.request('/api/v1/nodes?limit=20', {
      headers: { Authorization: `Bearer ${reader.token}` },
    });
    expect(list.status).toBe(200);

    const denied = await fixture.api.request(
      '/api/v1/nodes/test',
      jsonMutation(connectionBody(), { bearer: reader.token, origin: null }),
    );
    expect(denied.status).toBe(403);
    expect(fixture.calls).toHaveLength(0);

    fixture.outcomes.push(healthyProbe());
    const allowed = await fixture.api.request(
      '/api/v1/nodes/test',
      jsonMutation(connectionBody(), { bearer: writer.token, origin: null }),
    );
    expect(allowed.status).toBe(200);

    const cookie = await fixture.accessCookie();
    const missingOrigin = await fixture.api.request(
      '/api/v1/nodes/test',
      jsonMutation(connectionBody(), { cookie, origin: null }),
    );
    expect(missingOrigin.status).toBe(403);
    expect(fixture.calls).toHaveLength(1);
  });

  it('updates with retained credentials, retests, and deletes without upstream mutation', async () => {
    const fixture = createFixture();
    const cookie = await fixture.accessCookie();
    fixture.outcomes.push(healthyProbe(), healthyProbe());
    const createdResponse = await fixture.api.request(
      '/api/v1/nodes',
      jsonMutation(nodeBody(), { cookie }),
    );
    const created = (await createdResponse.json()) as { id: string };

    const updatedResponse = await fixture.api.request(
      `/api/v1/nodes/${created.id}`,
      {
        ...jsonMutation({ host: 'updated.example.test' }, { cookie }),
        method: 'PATCH',
      },
    );
    expect(updatedResponse.status).toBe(200);
    expect(fixture.calls[1]).toMatchObject({
      host: 'updated.example.test',
      username: 'synthetic-admin-1',
      password: 'synthetic-password-1',
    });

    fixture.advance(60_000);
    fixture.outcomes.push(
      new WgEasyAdapterError({ code: 'TIMEOUT', operation: 'information' }),
    );
    const retested = await fixture.api.request(
      `/api/v1/nodes/${created.id}/test`,
      { method: 'POST', headers: { Cookie: cookie, Origin: TRUSTED_ORIGIN } },
    );
    expect(retested.status).toBe(200);
    expect(await retested.json()).toMatchObject({
      status: 'unreachable',
      detectedVersion: '15.4.0',
      mode: 'wireguard',
      lastErrorCode: 'TIMEOUT',
    });

    const callsBeforeDelete = fixture.calls.length;
    const deleted = await fixture.api.request(`/api/v1/nodes/${created.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie, Origin: TRUSTED_ORIGIN },
    });
    expect(deleted.status).toBe(204);
    expect(fixture.calls).toHaveLength(callsBeforeDelete);
  });

  it('returns safe conflicts for duplicates and placement-protected deletion', async () => {
    const fixture = createFixture();
    const cookie = await fixture.accessCookie();
    fixture.outcomes.push(healthyProbe());
    const createdResponse = await fixture.api.request(
      '/api/v1/nodes',
      jsonMutation(nodeBody(), { cookie }),
    );
    const created = (await createdResponse.json()) as { id: string };

    const duplicate = await fixture.api.request(
      '/api/v1/nodes',
      jsonMutation(
        { ...nodeBody(2), host: nodeBody().host, name: nodeBody().name },
        { cookie },
      ),
    );
    expect(duplicate.status).toBe(409);
    expect(JSON.stringify(await duplicate.json())).not.toContain(
      'synthetic-password',
    );

    const timestamp = Date.parse('2026-09-27T10:00:00.000Z');
    fixture.connection.sqlite
      .prepare(
        `insert into managed_clients
         (id, name, expires_at, enabled, lifecycle_status, created_at, updated_at)
         values (?, ?, null, 1, 'active', ?, ?)`,
      )
      .run(
        '10000000-0000-4000-8000-000000000001',
        'Synthetic managed client',
        timestamp,
        timestamp,
      );
    fixture.connection.sqlite
      .prepare(
        `insert into placements
         (id, managed_client_id, node_id, status, created_at, updated_at)
         values (?, ?, ?, 'pending', ?, ?)`,
      )
      .run(
        '20000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        created.id,
        timestamp,
        timestamp,
      );
    const deleted = await fixture.api.request(`/api/v1/nodes/${created.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie, Origin: TRUSTED_ORIGIN },
    });
    expect(deleted.status).toBe(409);
    expect(await deleted.json()).toMatchObject({
      error: { code: 'CONFLICT', message: 'Node has managed placements' },
    });
  });

  it('rejects invalid hosts before adapter construction', async () => {
    const fixture = createFixture();
    const cookie = await fixture.accessCookie();
    const invalid = await fixture.api.request(
      '/api/v1/nodes/test',
      jsonMutation(
        { ...connectionBody(), host: 'https://node.example.test/api' },
        { cookie },
      ),
    );
    expect(invalid.status).toBe(400);
    expect(fixture.calls).toHaveLength(0);
  });
});
