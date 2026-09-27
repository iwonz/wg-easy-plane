import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthService } from '@wg-easy-plane/auth';
import { openDatabase } from '@wg-easy-plane/database';
import type { DatabaseConnection } from '@wg-easy-plane/database';
import { migrateDatabase } from '@wg-easy-plane/database/migrations';

import { createApi } from './app';

const TRUSTED_ORIGIN = 'https://panel.example.test';
const temporaryDirectories: string[] = [];
const openConnections: DatabaseConnection[] = [];

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wgep-api-auth-'));
  temporaryDirectories.push(directory);
  const databasePath = path.join(directory, 'panel.sqlite');
  migrateDatabase(databasePath);
  const connection = openDatabase(databasePath);
  openConnections.push(connection);
  const authService = new AuthService(connection, {
    masterKey: Buffer.alloc(32, 13),
  });
  const api = createApi({
    getAuthRuntime: () => ({ authService, trustedOrigin: TRUSTED_ORIGIN }),
  });
  return { api, authService, connection };
}

function jsonRequest(body: unknown, origin = TRUSTED_ORIGIN): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
    },
    body: JSON.stringify(body),
  };
}

function setCookies(response: Response): string[] {
  return (
    response.headers as Headers & { getSetCookie: () => string[] }
  ).getSetCookie();
}

function cookieHeader(cookies: string[]): string {
  return cookies.map((cookie) => cookie.split(';', 1)[0]).join('; ');
}

function namedCookie(cookies: string[], name: string): string {
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`Missing ${name} cookie`);
  return cookie.split(';', 1)[0]!;
}

afterEach(() => {
  for (const connection of openConnections.splice(0)) connection.close();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('administrator authentication API', () => {
  it('reports setup state without administrator details', async () => {
    const { api } = createFixture();

    const response = await api.request('/api/v1/auth/setup/status');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({ setupRequired: true });
  });

  it('rejects untrusted origins before creating the administrator', async () => {
    const { api, authService } = createFixture();

    const response = await api.request(
      '/api/v1/auth/setup',
      jsonRequest(
        {
          username: 'panel-admin',
          password: 'synthetic-password-1',
        },
        'https://attacker.example.test',
      ),
    );

    expect(response.status).toBe(403);
    expect(authService.getSetupStatus()).toEqual({ setupRequired: true });
    expect(await response.json()).toMatchObject({
      error: { code: 'FORBIDDEN', message: 'Untrusted request origin' },
    });

    const missingOrigin = await api.request('/api/v1/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'panel-admin',
        password: 'synthetic-password-1',
      }),
    });
    expect(missingOrigin.status).toBe(403);
    expect(authService.getSetupStatus()).toEqual({ setupRequired: true });
  });

  it('creates one administrator and issues secure cookie-only JWTs', async () => {
    const { api } = createFixture();

    const response = await api.request(
      '/api/v1/auth/setup',
      jsonRequest({
        username: 'panel-admin',
        password: 'synthetic-password-1',
      }),
    );
    const body = await response.json();
    const cookies = setCookies(response);

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ admin: { username: 'panel-admin' } });
    expect(JSON.stringify(body)).not.toContain('eyJ');
    expect(cookies).toHaveLength(2);
    for (const cookie of cookies) {
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
    }
    expect(cookies.some((cookie) => cookie.startsWith('wgep_access='))).toBe(
      true,
    );
    expect(cookies.some((cookie) => cookie.startsWith('wgep_refresh='))).toBe(
      true,
    );
    expect(
      cookies.find((cookie) => cookie.startsWith('wgep_access=')),
    ).toContain('Max-Age=900');
    expect(
      cookies.find((cookie) => cookie.startsWith('wgep_refresh=')),
    ).toContain('Max-Age=2592000');

    const conflict = await api.request(
      '/api/v1/auth/setup',
      jsonRequest({
        username: 'another-admin',
        password: 'synthetic-password-2',
      }),
    );
    expect(conflict.status).toBe(409);
  });

  it('validates setup input with the standard error envelope', async () => {
    const { api } = createFixture();

    const response = await api.request(
      '/api/v1/auth/setup',
      jsonRequest({ username: 'UPPER', password: 'short' }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
      },
    });
  });

  it('protects current-admin access and never returns the password hash', async () => {
    const { api } = createFixture();
    const setup = await api.request(
      '/api/v1/auth/setup',
      jsonRequest({
        username: 'panel-admin',
        password: 'synthetic-password-1',
      }),
    );
    const accessCookie = namedCookie(setCookies(setup), 'wgep_access');

    const unauthorized = await api.request('/api/v1/auth/me');
    expect(unauthorized.status).toBe(401);

    const response = await api.request('/api/v1/auth/me', {
      headers: { Cookie: accessCookie },
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ admin: { username: 'panel-admin' } });
    expect(JSON.stringify(body)).not.toContain('password');
  });

  it('rotates cookies and clears them when an old refresh token is replayed', async () => {
    const { api } = createFixture();
    const setup = await api.request(
      '/api/v1/auth/setup',
      jsonRequest({
        username: 'panel-admin',
        password: 'synthetic-password-1',
      }),
    );
    const initialCookies = setCookies(setup);
    const oldRefresh = namedCookie(initialCookies, 'wgep_refresh');

    const refresh = await api.request('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { Cookie: oldRefresh, Origin: TRUSTED_ORIGIN },
    });
    expect(refresh.status).toBe(204);
    const rotatedCookies = setCookies(refresh);
    expect(cookieHeader(rotatedCookies)).not.toContain(oldRefresh);

    const replay = await api.request('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { Cookie: oldRefresh, Origin: TRUSTED_ORIGIN },
    });
    expect(replay.status).toBe(401);
    expect(
      setCookies(replay).every((cookie) => cookie.includes('Max-Age=0')),
    ).toBe(true);

    const revokedSuccessor = await api.request('/api/v1/auth/refresh', {
      method: 'POST',
      headers: {
        Cookie: namedCookie(rotatedCookies, 'wgep_refresh'),
        Origin: TRUSTED_ORIGIN,
      },
    });
    expect(revokedSuccessor.status).toBe(401);
  });

  it('returns uniform login failures and a durable rate-limit response', async () => {
    const { api } = createFixture();
    await api.request(
      '/api/v1/auth/setup',
      jsonRequest({
        username: 'panel-admin',
        password: 'synthetic-password-1',
      }),
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await api.request(
        '/api/v1/auth/login',
        jsonRequest({
          username: 'panel-admin',
          password: 'synthetic-password-wrong',
        }),
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: { message: 'Invalid username or password' },
      });
    }

    const limited = await api.request(
      '/api/v1/auth/login',
      jsonRequest({
        username: 'panel-admin',
        password: 'synthetic-password-1',
      }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(await limited.json()).toMatchObject({
      error: { code: 'RATE_LIMITED' },
    });
  });

  it('logs out idempotently and clears both cookies', async () => {
    const { api } = createFixture();
    const setup = await api.request(
      '/api/v1/auth/setup',
      jsonRequest({
        username: 'panel-admin',
        password: 'synthetic-password-1',
      }),
    );

    const response = await api.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: {
        Cookie: cookieHeader(setCookies(setup)),
        Origin: TRUSTED_ORIGIN,
      },
    });
    expect(response.status).toBe(204);
    expect(setCookies(response)).toHaveLength(2);
    expect(
      setCookies(response).every((cookie) => cookie.includes('Max-Age=0')),
    ).toBe(true);

    const repeated = await api.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: { Origin: TRUSTED_ORIGIN },
    });
    expect(repeated.status).toBe(204);
  });
});
