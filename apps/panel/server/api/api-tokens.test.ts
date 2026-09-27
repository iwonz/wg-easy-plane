import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiTokenService, AuthService } from '@wg-easy-plane/auth';
import { openDatabase } from '@wg-easy-plane/database';
import type { DatabaseConnection } from '@wg-easy-plane/database';
import { migrateDatabase } from '@wg-easy-plane/database/migrations';

import { createApi } from './app';

const TRUSTED_ORIGIN = 'https://panel.example.test';
const temporaryDirectories: string[] = [];
const openConnections: DatabaseConnection[] = [];

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wgep-api-pat-'));
  temporaryDirectories.push(directory);
  const databasePath = path.join(directory, 'panel.sqlite');
  migrateDatabase(databasePath);
  const connection = openDatabase(databasePath);
  openConnections.push(connection);
  let now = new Date('2026-09-27T10:00:00.000Z');
  let randomByte = 1;
  const masterKey = Buffer.alloc(32, 23);
  const authService = new AuthService(connection, {
    masterKey,
    now: () => now,
  });
  const apiTokenService = new ApiTokenService(connection, {
    masterKey,
    now: () => now,
    randomBytes: (size) => Buffer.alloc(size, randomByte++),
  });
  const runtime = {
    authService,
    apiTokenService,
    trustedOrigin: TRUSTED_ORIGIN,
  };
  const api = createApi({
    getAuthRuntime: () => runtime,
    getApiTokenRuntime: () => runtime,
  });

  return {
    api,
    apiTokenService,
    connection,
    setNow(value: string) {
      now = new Date(value);
    },
    async accessCookie() {
      const session = await authService.setup({
        username: 'panel-admin',
        password: 'synthetic-password-1',
      });
      return `wgep_access=${session.tokens.accessToken}`;
    },
  };
}

function tokenRequest(
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

describe('scoped API token routes', () => {
  it('creates a token with a cookie, reveals it once, and lists only safe metadata', async () => {
    const fixture = createFixture();
    const cookie = await fixture.accessCookie();
    const createdResponse = await fixture.api.request(
      '/api/v1/tokens',
      tokenRequest(
        {
          name: 'Inventory reader',
          scopes: ['nodes:read'],
          expiresAt: '2026-10-27T10:00:00.000Z',
        },
        { cookie },
      ),
    );
    const created = (await createdResponse.json()) as {
      token: string;
      metadata: { id: string };
    };

    expect(createdResponse.status).toBe(201);
    expect(createdResponse.headers.get('cache-control')).toBe(
      'private, no-store',
    );
    expect(created.token).toMatch(/^wgep_pat_[A-Za-z0-9_-]{43}$/);
    const stored = fixture.connection.sqlite
      .prepare('select * from api_tokens where id = ?')
      .get(created.metadata.id);
    expect(JSON.stringify(stored)).not.toContain(created.token);

    const listedResponse = await fixture.api.request(
      '/api/v1/tokens?limit=20',
      {
        headers: { Cookie: cookie },
      },
    );
    const listed = await listedResponse.json();
    expect(listedResponse.status).toBe(200);
    expect(JSON.stringify(listed)).not.toContain(created.token);
    expect(JSON.stringify(listed)).not.toContain('tokenHash');
    expect(listed).toMatchObject({
      items: [{ name: 'Inventory reader', scopes: ['nodes:read'] }],
      page: { nextCursor: null },
    });
  });

  it('requires exact scope and records valid under-scoped use', async () => {
    const fixture = createFixture();
    const token = fixture.apiTokenService.create({
      name: 'Node writer',
      scopes: ['nodes:write'],
    });

    const response = await fixture.api.request('/api/v1/tokens', {
      headers: { Authorization: `Bearer ${token.token}` },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(
      fixture.apiTokenService.list({ limit: 50 }).items[0]?.lastUsedAt,
    ).toBe('2026-09-27T10:00:00.000Z');
  });

  it('allows a management PAT to create and revoke without a browser Origin', async () => {
    const fixture = createFixture();
    const manager = fixture.apiTokenService.create({
      name: 'Token manager',
      scopes: ['tokens:manage'],
    });
    const createdResponse = await fixture.api.request(
      '/api/v1/tokens',
      tokenRequest(
        { name: 'Short-lived reader', scopes: ['system:read'] },
        { bearer: manager.token, origin: null },
      ),
    );
    const created = (await createdResponse.json()) as {
      token: string;
      metadata: { id: string };
    };
    expect(createdResponse.status).toBe(201);

    const revoke = await fixture.api.request(
      `/api/v1/tokens/${created.metadata.id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${manager.token}` },
      },
    );
    const repeated = await fixture.api.request(
      `/api/v1/tokens/${created.metadata.id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${manager.token}` },
      },
    );

    expect(revoke.status).toBe(204);
    expect(repeated.status).toBe(204);
    expect(() => fixture.apiTokenService.authenticate(created.token)).toThrow();
  });

  it('rejects cookie mutations without trusted Origin', async () => {
    const fixture = createFixture();
    const cookie = await fixture.accessCookie();

    const response = await fixture.api.request(
      '/api/v1/tokens',
      tokenRequest(
        { name: 'Blocked', scopes: ['nodes:read'] },
        { cookie, origin: null },
      ),
    );

    expect(response.status).toBe(403);
    expect(fixture.apiTokenService.list({ limit: 50 }).items).toHaveLength(0);
  });

  it('does not fall back to a valid cookie when Authorization is invalid', async () => {
    const fixture = createFixture();
    const cookie = await fixture.accessCookie();

    const response = await fixture.api.request('/api/v1/tokens', {
      headers: {
        Authorization: 'Bearer malformed',
        Cookie: cookie,
      },
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: 'UNAUTHORIZED', message: 'Authentication is required' },
    });
  });

  it('returns the same safe failure for malformed, expired, and revoked PATs', async () => {
    const fixture = createFixture();
    const expired = fixture.apiTokenService.create({
      name: 'Expiring',
      scopes: ['tokens:manage'],
      expiresAt: new Date('2026-09-27T10:01:00.000Z'),
    });
    const revoked = fixture.apiTokenService.create({
      name: 'Revoked',
      scopes: ['tokens:manage'],
    });
    fixture.apiTokenService.revoke(revoked.metadata.id);
    fixture.setNow('2026-09-27T10:01:00.000Z');

    const credentials = ['malformed', expired.token, revoked.token];
    for (const credential of credentials) {
      const response = await fixture.api.request('/api/v1/tokens', {
        headers: { Authorization: `Bearer ${credential}` },
      });
      expect(response.status).toBe(401);
      const body = await response.text();
      expect(body).toContain('Authentication is required');
      expect(body).not.toContain(credential);
      expect(body).not.toContain('expired');
      expect(body).not.toContain('revoked');
    }
  });

  it('validates scopes, expiration, pagination, and unknown revoke IDs safely', async () => {
    const fixture = createFixture();
    const cookie = await fixture.accessCookie();

    const repeatedScope = await fixture.api.request(
      '/api/v1/tokens',
      tokenRequest(
        { name: 'Invalid', scopes: ['nodes:read', 'nodes:read'] },
        { cookie },
      ),
    );
    expect(repeatedScope.status).toBe(400);

    const expired = await fixture.api.request(
      '/api/v1/tokens',
      tokenRequest(
        {
          name: 'Invalid expiry',
          scopes: ['nodes:read'],
          expiresAt: '2026-09-27T09:59:00.000Z',
        },
        { cookie },
      ),
    );
    expect(expired.status).toBe(400);

    const badCursor = await fixture.api.request(
      '/api/v1/tokens?cursor=invalid&limit=20',
      { headers: { Cookie: cookie } },
    );
    expect(badCursor.status).toBe(400);

    const notFound = await fixture.api.request(
      '/api/v1/tokens/00000000-0000-4000-8000-999999999999',
      {
        method: 'DELETE',
        headers: { Cookie: cookie, Origin: TRUSTED_ORIGIN },
      },
    );
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toMatchObject({
      error: { code: 'NOT_FOUND', message: 'API token does not exist' },
    });
  });
});
