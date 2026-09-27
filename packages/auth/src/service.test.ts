import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '@wg-easy-plane/database';
import { migrateDatabase } from '@wg-easy-plane/database/migrations';

import { AuthError, AuthService } from './service';

const temporaryDirectories: string[] = [];

function createFixture(now = new Date('2026-01-02T03:04:05.000Z')) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wgep-auth-'));
  temporaryDirectories.push(directory);
  const databasePath = path.join(directory, 'auth.sqlite');
  migrateDatabase(databasePath);
  const connection = openDatabase(databasePath);
  let currentTime = now;
  const service = new AuthService(connection, {
    masterKey: Buffer.alloc(32, 11),
    now: () => currentTime,
  });

  return {
    connection,
    databasePath,
    service,
    advance(milliseconds: number) {
      currentTime = new Date(currentTime.getTime() + milliseconds);
    },
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('AuthService', () => {
  it('atomically creates one administrator during a setup race', async () => {
    const fixture = createFixture();
    const competingConnection = openDatabase(fixture.databasePath);
    const competingService = new AuthService(competingConnection, {
      masterKey: Buffer.alloc(32, 11),
      now: () => new Date('2026-01-02T03:04:05.000Z'),
    });

    const results = await Promise.allSettled([
      competingService.setup({
        username: 'first-admin',
        password: 'synthetic-password-1',
      }),
      fixture.service.setup({
        username: 'second-admin',
        password: 'synthetic-password-2',
      }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejection = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(rejection?.reason).toMatchObject({ code: 'SETUP_COMPLETE' });

    const admin = fixture.connection.sqlite
      .prepare('select username, password_hash from admins')
      .get() as { username: string; password_hash: string };
    expect(['first-admin', 'second-admin']).toContain(admin.username);
    expect(admin.password_hash).toMatch(/^\$argon2id\$/);
    expect(admin.password_hash).not.toContain('synthetic-password');

    const session = fixture.connection.sqlite
      .prepare('select token_hash from refresh_sessions')
      .get() as { token_hash: string };
    expect(session.token_hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.token_hash).not.toContain('eyJ');
    competingConnection.close();
    fixture.connection.close();
  });

  it('enforces credential policy before creating state', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.setup({ username: 'UPPER', password: 'too-short' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(fixture.service.getSetupStatus()).toEqual({ setupRequired: true });
    fixture.connection.close();
  });

  it('authenticates access tokens and rejects them after expiry', async () => {
    const fixture = createFixture();
    const created = await fixture.service.setup({
      username: 'panel-admin',
      password: 'synthetic-password-1',
    });

    await expect(
      fixture.service.currentAdmin(created.tokens.accessToken),
    ).resolves.toEqual(created.admin);
    fixture.advance(16 * 60 * 1000);
    await expect(
      fixture.service.currentAdmin(created.tokens.accessToken),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    fixture.connection.close();
  });

  it('returns the same safe login error for an unknown user and wrong password', async () => {
    const fixture = createFixture();
    await fixture.service.setup({
      username: 'panel-admin',
      password: 'synthetic-password-1',
    });

    await expect(
      fixture.service.login({
        username: 'missing-admin',
        password: 'synthetic-password-1',
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid username or password',
    });
    await expect(
      fixture.service.login({
        username: 'panel-admin',
        password: 'synthetic-password-wrong',
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid username or password',
    });
    fixture.connection.close();
  });

  it('rotates refresh tokens and revokes the family on replay', async () => {
    const fixture = createFixture();
    const created = await fixture.service.setup({
      username: 'panel-admin',
      password: 'synthetic-password-1',
    });
    const rotated = await fixture.service.refresh(created.tokens.refreshToken);

    expect(rotated.refreshToken).not.toBe(created.tokens.refreshToken);
    await expect(
      fixture.service.refresh(created.tokens.refreshToken),
    ).rejects.toMatchObject({ code: 'REFRESH_REUSED' });
    await expect(
      fixture.service.refresh(rotated.refreshToken),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    const activeRows = fixture.connection.sqlite
      .prepare(
        'select count(*) as count from refresh_sessions where revoked_at is null',
      )
      .get() as { count: number };
    expect(activeRows.count).toBe(0);
    fixture.connection.close();
  });

  it('allows at most one concurrent refresh and revokes the raced family', async () => {
    const fixture = createFixture();
    const created = await fixture.service.setup({
      username: 'panel-admin',
      password: 'synthetic-password-1',
    });

    const results = await Promise.allSettled([
      fixture.service.refresh(created.tokens.refreshToken),
      fixture.service.refresh(created.tokens.refreshToken),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const activeRows = fixture.connection.sqlite
      .prepare(
        'select count(*) as count from refresh_sessions where revoked_at is null',
      )
      .get() as { count: number };
    expect(activeRows.count).toBe(0);
    fixture.connection.close();
  });

  it('revokes refresh capability on idempotent logout, including after expiry', async () => {
    const fixture = createFixture();
    const created = await fixture.service.setup({
      username: 'panel-admin',
      password: 'synthetic-password-1',
    });
    fixture.advance(31 * 24 * 60 * 60 * 1000);

    await fixture.service.logout(created.tokens.refreshToken);
    await fixture.service.logout(created.tokens.refreshToken);
    await fixture.service.logout(undefined);
    await expect(
      fixture.service.refresh(created.tokens.refreshToken),
    ).rejects.toBeInstanceOf(AuthError);

    const activeRows = fixture.connection.sqlite
      .prepare(
        'select count(*) as count from refresh_sessions where revoked_at is null',
      )
      .get() as { count: number };
    expect(activeRows.count).toBe(0);
    fixture.connection.close();
  });

  it('persists login rate limits across database connections and resets by time', async () => {
    const fixture = createFixture();
    await fixture.service.setup({
      username: 'panel-admin',
      password: 'synthetic-password-1',
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        fixture.service.login({
          username: 'panel-admin',
          password: 'synthetic-password-wrong',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }

    fixture.connection.close();
    const reopened = openDatabase(fixture.databasePath);
    const service = new AuthService(reopened, {
      masterKey: Buffer.alloc(32, 11),
      now: () => new Date('2026-01-02T03:04:05.000Z'),
    });
    await expect(
      service.login({
        username: 'panel-admin',
        password: 'synthetic-password-1',
      }),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterSeconds: 900,
    });
    reopened.close();

    const afterWindow = openDatabase(fixture.databasePath);
    const resetService = new AuthService(afterWindow, {
      masterKey: Buffer.alloc(32, 11),
      now: () => new Date('2026-01-02T03:20:05.000Z'),
    });
    await expect(
      resetService.login({
        username: 'panel-admin',
        password: 'synthetic-password-1',
      }),
    ).resolves.toMatchObject({ admin: { username: 'panel-admin' } });

    const rateRows = afterWindow.sqlite
      .prepare('select key, bucket from rate_limits')
      .all() as { key: string; bucket: string }[];
    expect(rateRows.every((row) => !row.key.includes('panel-admin'))).toBe(
      true,
    );
    afterWindow.close();
  });
});
