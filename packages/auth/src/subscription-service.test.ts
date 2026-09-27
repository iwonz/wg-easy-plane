import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '@wg-easy-plane/database';
import { migrateDatabase } from '@wg-easy-plane/database/migrations';

import {
  SUBSCRIPTION_SESSION_TTL_SECONDS,
  SubscriptionService,
} from './subscription-service';

const CLIENT_ID = '10000000-0000-4000-8000-000000000001';
const temporaryDirectories: string[] = [];

function createFixture(options?: { publicUrl?: URL | null }) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wgep-subscription-'),
  );
  temporaryDirectories.push(directory);
  const databasePath = path.join(directory, 'subscription.sqlite');
  migrateDatabase(databasePath);
  const connection = openDatabase(databasePath);
  let now = new Date('2026-09-27T10:00:00.000Z');
  let sequence = 0;
  connection.sqlite
    .prepare(
      `insert into managed_clients
       (id, name, expires_at, enabled, lifecycle_status, created_at, updated_at)
       values (?, 'Synthetic subscriber', null, 1, 'active', ?, ?)`,
    )
    .run(CLIENT_ID, now.getTime(), now.getTime());
  const service = new SubscriptionService(connection, {
    masterKey: Buffer.alloc(32, 23),
    ...(options?.publicUrl === null
      ? {}
      : {
          subscriptionPublicUrl:
            options?.publicUrl ?? new URL('https://subscription.example.test'),
        }),
    now: () => now,
    newId: () =>
      `20000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
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

function fragmentToken(link: string | null): string {
  if (!link) throw new Error('Expected active subscription link');
  return new URL(link).hash.slice(1);
}

async function expectAsyncCode(
  operation: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(operation()).rejects.toMatchObject({ code });
}

function expectCode(operation: () => unknown, code: string): void {
  try {
    operation();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('SubscriptionService', () => {
  it('rotates a recoverable fragment link while persisting no plaintext', () => {
    const fixture = createFixture();
    expect(fixture.service.getLink(CLIENT_ID)).toMatchObject({
      status: 'missing',
      url: null,
      version: null,
    });

    const first = fixture.service.rotate(CLIENT_ID);
    const firstToken = fragmentToken(first.url);
    const row = fixture.connection.sqlite
      .prepare('select * from subscription_tokens where managed_client_id = ?')
      .get(CLIENT_ID) as Record<string, unknown>;

    expect(firstToken).toMatch(/^wgep_sub_[A-Za-z0-9_-]{43}$/);
    expect(first).toMatchObject({ status: 'active', version: 1 });
    expect(fixture.service.getLink(CLIENT_ID).url).toBe(first.url);
    expect(JSON.stringify(row)).not.toContain(firstToken);
    expect(row.token_hash).not.toBe(firstToken);
    expect(row.token_ciphertext).not.toBe(firstToken);

    fixture.advance(1_000);
    const second = fixture.service.rotate(CLIENT_ID);
    expect(second.version).toBe(2);
    expect(fragmentToken(second.url)).not.toBe(firstToken);
    expect(second.rotatedAt).toBe('2026-09-27T10:00:01.000Z');
    fixture.connection.close();
  });

  it('exchanges, expires, rotates, and revokes sessions immediately', async () => {
    const fixture = createFixture();
    const firstToken = fragmentToken(fixture.service.rotate(CLIENT_ID).url);
    const firstSession = await fixture.service.exchange(firstToken);
    await expect(
      fixture.service.authenticateSession(firstSession.token),
    ).resolves.toMatchObject({
      kind: 'subscription',
      managedClientId: CLIENT_ID,
      tokenVersion: 1,
    });

    const secondToken = fragmentToken(fixture.service.rotate(CLIENT_ID).url);
    await expectAsyncCode(
      () => fixture.service.authenticateSession(firstSession.token),
      'UNAUTHORIZED',
    );
    await expectAsyncCode(
      () => fixture.service.exchange(firstToken),
      'UNAUTHORIZED',
    );

    const secondSession = await fixture.service.exchange(secondToken);
    fixture.service.revoke(CLIENT_ID);
    await expectAsyncCode(
      () => fixture.service.authenticateSession(secondSession.token),
      'UNAUTHORIZED',
    );
    expect(fixture.service.getLink(CLIENT_ID)).toMatchObject({
      status: 'revoked',
      url: null,
      version: 2,
    });

    const thirdToken = fragmentToken(fixture.service.rotate(CLIENT_ID).url);
    const thirdSession = await fixture.service.exchange(thirdToken);
    fixture.advance(SUBSCRIPTION_SESSION_TTL_SECONDS * 1_000 + 1);
    await expectAsyncCode(
      () => fixture.service.authenticateSession(thirdSession.token),
      'UNAUTHORIZED',
    );
    fixture.connection.close();
  });

  it('requires configured link origin and an active existing client', () => {
    const fixture = createFixture({ publicUrl: null });
    expectCode(() => fixture.service.rotate(CLIENT_ID), 'CONFLICT');
    expect(
      fixture.connection.sqlite
        .prepare('select count(*) as count from subscription_tokens')
        .get(),
    ).toEqual({ count: 0 });

    fixture.connection.sqlite
      .prepare(
        "update managed_clients set lifecycle_status = 'deleting' where id = ?",
      )
      .run(CLIENT_ID);
    const configured = new SubscriptionService(fixture.connection, {
      masterKey: Buffer.alloc(32, 23),
      subscriptionPublicUrl: new URL('https://subscription.example.test'),
    });
    expectCode(() => configured.rotate(CLIENT_ID), 'CONFLICT');
    expectCode(
      () => configured.getLink('10000000-0000-4000-8000-000000000099'),
      'NOT_FOUND',
    );
    fixture.connection.close();
  });

  it('rate limits repeated invalid exchanges without storing plaintext', async () => {
    const fixture = createFixture();
    const invalid = `wgep_sub_${'z'.repeat(43)}`;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expectAsyncCode(
        () => fixture.service.exchange(invalid),
        'UNAUTHORIZED',
      );
    }
    await expectAsyncCode(
      () => fixture.service.exchange(invalid),
      'RATE_LIMITED',
    );
    const serialized = JSON.stringify(
      fixture.connection.sqlite.prepare('select * from rate_limits').all(),
    );
    expect(serialized).not.toContain(invalid);
    fixture.connection.close();
  });
});
