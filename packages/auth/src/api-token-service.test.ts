import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '@wg-easy-plane/database';
import { migrateDatabase } from '@wg-easy-plane/database/migrations';

import { ApiTokenService } from './api-token-service';

const temporaryDirectories: string[] = [];

function expectErrorCode(operation: () => unknown, code: string): void {
  try {
    operation();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wgep-pat-'));
  temporaryDirectories.push(directory);
  const databasePath = path.join(directory, 'tokens.sqlite');
  migrateDatabase(databasePath);
  const connection = openDatabase(databasePath);
  let now = new Date('2026-09-27T10:00:00.000Z');
  let sequence = 0;
  const service = new ApiTokenService(connection, {
    masterKey: Buffer.alloc(32, 17),
    now: () => now,
    newId: () =>
      `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    randomBytes: (size) => Buffer.alloc(size, sequence + 1),
  });

  return {
    connection,
    service,
    advance(milliseconds: number) {
      now = new Date(now.getTime() + milliseconds);
    },
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('ApiTokenService', () => {
  it('stores only a keyed hash and safe prefix while returning the secret once', () => {
    const fixture = createFixture();
    const created = fixture.service.create({
      name: 'Synthetic automation',
      scopes: ['nodes:read', 'clients:write'],
    });
    const row = fixture.connection.sqlite
      .prepare('select * from api_tokens where id = ?')
      .get(created.metadata.id) as Record<string, unknown>;

    expect(created.token).toMatch(/^wgep_pat_[A-Za-z0-9_-]{43}$/);
    expect(created.metadata.prefix).toHaveLength('wgep_pat_'.length + 8);
    expect(JSON.stringify(row)).not.toContain(created.token);
    expect(row.token_hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(row.token_prefix).toBe(created.metadata.prefix);
    expect(fixture.service.list({ limit: 50 }).items[0]).not.toHaveProperty(
      'token',
    );
    expect(fixture.service.list({ limit: 50 }).items[0]).not.toHaveProperty(
      'tokenHash',
    );
    fixture.connection.close();
  });

  it('validates names, exact unique scopes, and future expiration', () => {
    const fixture = createFixture();

    expectErrorCode(
      () => fixture.service.create({ name: ' ', scopes: ['nodes:read'] }),
      'INVALID_INPUT',
    );
    expectErrorCode(
      () =>
        fixture.service.create({
          name: 'Duplicate',
          scopes: ['nodes:read', 'nodes:read'],
        }),
      'INVALID_INPUT',
    );
    expectErrorCode(
      () =>
        fixture.service.create({
          name: 'Expired',
          scopes: ['nodes:read'],
          expiresAt: new Date('2026-09-27T09:59:59.000Z'),
        }),
      'INVALID_INPUT',
    );
    fixture.connection.close();
  });

  it('authenticates exact scopes, updates last use, and rejects expiry', () => {
    const fixture = createFixture();
    const created = fixture.service.create({
      name: 'Reader',
      scopes: ['nodes:read'],
      expiresAt: new Date('2026-09-27T10:05:00.000Z'),
    });
    fixture.advance(60_000);

    expect(fixture.service.authenticate(created.token)).toEqual({
      kind: 'api-token',
      tokenId: created.metadata.id,
      scopes: ['nodes:read'],
    });
    expect(fixture.service.list({ limit: 50 }).items[0]?.lastUsedAt).toBe(
      '2026-09-27T10:01:00.000Z',
    );

    fixture.advance(4 * 60_000);
    expectErrorCode(
      () => fixture.service.authenticate(created.token),
      'UNAUTHORIZED',
    );
    fixture.connection.close();
  });

  it('revokes immediately and preserves the first revocation timestamp', () => {
    const fixture = createFixture();
    const created = fixture.service.create({
      name: 'Revocable',
      scopes: ['tokens:manage'],
    });
    fixture.service.revoke(created.metadata.id);
    const first = fixture.service.list({ limit: 50 }).items[0]?.revokedAt;
    fixture.advance(60_000);
    fixture.service.revoke(created.metadata.id);

    expect(fixture.service.list({ limit: 50 }).items[0]?.revokedAt).toBe(first);
    expectErrorCode(
      () => fixture.service.authenticate(created.token),
      'UNAUTHORIZED',
    );
    expectErrorCode(
      () => fixture.service.revoke('00000000-0000-4000-8000-999999999999'),
      'NOT_FOUND',
    );
    fixture.connection.close();
  });

  it('uses stable newest-first cursor pagination and rejects malformed cursors', () => {
    const fixture = createFixture();
    const first = fixture.service.create({
      name: 'First',
      scopes: ['system:read'],
    });
    const second = fixture.service.create({
      name: 'Second',
      scopes: ['system:read'],
    });
    const pageOne = fixture.service.list({ limit: 1 });
    const pageTwo = fixture.service.list({
      limit: 1,
      cursor: pageOne.nextCursor ?? undefined,
    });

    expect(pageOne.items.map((item) => item.id)).toEqual([second.metadata.id]);
    expect(pageTwo.items.map((item) => item.id)).toEqual([first.metadata.id]);
    expect(pageTwo.nextCursor).toBeNull();
    expectErrorCode(
      () => fixture.service.list({ limit: 1, cursor: 'not-a-cursor' }),
      'INVALID_CURSOR',
    );
    fixture.connection.close();
  });
});
