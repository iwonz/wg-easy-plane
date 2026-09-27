import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '@wg-easy-plane/database';
import type { DatabaseConnection } from '@wg-easy-plane/database';
import { migrateDatabase } from '@wg-easy-plane/database/migrations';
import {
  WgEasyAdapterError,
  type WgEasyConnection,
  type WgEasyProbe,
} from '@wg-easy-plane/wg-easy-adapter';

import { NodeCredentialCipher } from './crypto';
import { NodeService } from './service';

const temporaryDirectories: string[] = [];
const openConnections: DatabaseConnection[] = [];
const MASTER_KEY = Buffer.alloc(32, 29);

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

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wgep-nodes-'));
  temporaryDirectories.push(directory);
  const databasePath = path.join(directory, 'nodes.sqlite');
  migrateDatabase(databasePath);
  const connection = openDatabase(databasePath);
  openConnections.push(connection);
  let now = new Date('2026-09-27T10:00:00.000Z');
  let sequence = 0;
  let ivByte = 1;
  const calls: WgEasyConnection[] = [];
  const outcomes: (WgEasyProbe | Error)[] = [];
  const service = new NodeService(connection, {
    masterKey: MASTER_KEY,
    requestTimeoutMs: 4321,
    now: () => now,
    newId: () =>
      `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    randomBytes: (size) => Buffer.alloc(size, ivByte++),
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

  return {
    calls,
    connection,
    outcomes,
    service,
    advance(milliseconds: number) {
      now = new Date(now.getTime() + milliseconds);
    },
  };
}

function connectionInput(index = 1) {
  return {
    protocol: 'https' as const,
    host: `node-${index}.example.test`,
    port: 51821,
    username: `synthetic-admin-${index}`,
    password: `synthetic-password-${index}`,
    allowInsecureTls: false,
  };
}

function createInput(index = 1) {
  return { name: `Synthetic node ${index}`, ...connectionInput(index) };
}

function expectErrorCode(operation: () => unknown, code: string): void {
  try {
    operation();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

afterEach(() => {
  for (const connection of openConnections.splice(0)) connection.close();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('NodeService', () => {
  it('creates a healthy node with encrypted credentials and safe metadata', async () => {
    const fixture = createFixture();
    fixture.outcomes.push(healthyProbe('amnezia'));

    const created = await fixture.service.create(createInput());
    const row = fixture.connection.sqlite
      .prepare('select * from nodes where id = ?')
      .get(created.id) as Record<string, unknown>;
    const serializedRow = JSON.stringify(row);

    expect(created).toMatchObject({
      status: 'healthy',
      detectedVersion: '15.4.0',
      mode: 'amnezia',
      lastErrorCode: null,
      lastCheckedAt: '2026-09-27T10:00:00.000Z',
    });
    expect(created).not.toHaveProperty('username');
    expect(created).not.toHaveProperty('password');
    expect(serializedRow).not.toContain('synthetic-admin-1');
    expect(serializedRow).not.toContain('synthetic-password-1');
    expect(row.username_ciphertext).toMatch(/^v1\./);
    expect(row.password_ciphertext).toMatch(/^v1\./);
    expect(fixture.calls).toEqual([
      expect.objectContaining({
        host: 'node-1.example.test',
        username: 'synthetic-admin-1',
        password: 'synthetic-password-1',
        timeoutMs: 4321,
      }),
    ]);
  });

  it('persists every safe failure class without raw error details', async () => {
    const fixture = createFixture();
    const scenarios = [
      ['TIMEOUT', 'unreachable', 'TIMEOUT', null],
      ['UNREACHABLE', 'unreachable', 'UNREACHABLE', null],
      ['AUTH_FAILED', 'auth_failed', 'AUTH_FAILED', null],
      ['TLS_ERROR', 'tls_error', 'TLS_ERROR', null],
      [
        'UNSUPPORTED_VERSION',
        'unsupported_version',
        'UNSUPPORTED_VERSION',
        '15.5.0',
      ],
      ['API_INCOMPATIBLE', 'api_incompatible', 'API_INCOMPATIBLE', null],
      ['REDIRECT_BLOCKED', 'api_incompatible', 'REDIRECT_BLOCKED', null],
      ['RESPONSE_TOO_LARGE', 'api_incompatible', 'RESPONSE_TOO_LARGE', null],
      ['NOT_FOUND', 'api_incompatible', 'NOT_FOUND', null],
      ['UPSTREAM_ERROR', 'unreachable', 'UPSTREAM_ERROR', null],
    ] as const;

    for (const [code, status, lastErrorCode, detectedVersion] of scenarios) {
      fixture.outcomes.push(
        new WgEasyAdapterError({
          code,
          operation: 'information',
          ...(detectedVersion ? { detectedVersion } : {}),
        }),
      );
      const index = fixture.calls.length + 1;
      const created = await fixture.service.create(createInput(index));
      expect(created).toMatchObject({
        status,
        lastErrorCode,
        detectedVersion,
        mode: null,
      });
      expect(JSON.stringify(created)).not.toContain('synthetic-password');
    }
    expect(fixture.service.list({ limit: 50 }).items).toHaveLength(
      scenarios.length,
    );
  });

  it('retains omitted credentials and skips the probe for a display-name edit', async () => {
    const fixture = createFixture();
    fixture.outcomes.push(healthyProbe());
    const created = await fixture.service.create(createInput());
    const before = fixture.connection.sqlite
      .prepare(
        'select username_ciphertext, password_ciphertext from nodes where id = ?',
      )
      .get(created.id) as {
      username_ciphertext: string;
      password_ciphertext: string;
    };

    fixture.advance(1_000);
    const renamed = await fixture.service.update(created.id, {
      name: 'Renamed synthetic node',
    });
    expect(renamed.name).toBe('Renamed synthetic node');
    expect(fixture.calls).toHaveLength(1);
    const afterRename = fixture.connection.sqlite
      .prepare(
        'select username_ciphertext, password_ciphertext from nodes where id = ?',
      )
      .get(created.id);
    expect(afterRename).toEqual(before);

    fixture.outcomes.push(healthyProbe());
    await fixture.service.update(created.id, { host: 'renamed.example.test' });
    expect(fixture.calls[1]).toMatchObject({
      host: 'renamed.example.test',
      username: 'synthetic-admin-1',
      password: 'synthetic-password-1',
    });
    const afterConnection = fixture.connection.sqlite
      .prepare(
        'select username_ciphertext, password_ciphertext from nodes where id = ?',
      )
      .get(created.id) as {
      username_ciphertext: string;
      password_ciphertext: string;
    };
    expect(afterConnection.username_ciphertext).not.toBe(
      before.username_ciphertext,
    );
    expect(afterConnection.password_ciphertext).not.toBe(
      before.password_ciphertext,
    );
  });

  it('tests unsaved settings without persistence and preserves safe state on transient retest', async () => {
    const fixture = createFixture();
    fixture.outcomes.push(healthyProbe());
    const tested = await fixture.service.testConnection(connectionInput());
    expect(tested).toMatchObject({
      status: 'healthy',
      detectedVersion: '15.4.0',
      mode: 'wireguard',
    });
    expect(
      fixture.connection.sqlite
        .prepare('select count(*) as count from nodes')
        .get(),
    ).toEqual({ count: 0 });

    fixture.outcomes.push(healthyProbe('amnezia'));
    const created = await fixture.service.create(createInput());
    fixture.advance(60_000);
    fixture.outcomes.push(
      new WgEasyAdapterError({ code: 'TIMEOUT', operation: 'information' }),
    );
    const retested = await fixture.service.retest(created.id);
    expect(retested).toMatchObject({
      status: 'unreachable',
      detectedVersion: '15.4.0',
      mode: 'amnezia',
      lastErrorCode: 'TIMEOUT',
      lastCheckedAt: '2026-09-27T10:01:00.000Z',
    });
  });

  it('enforces uniqueness, stable pagination, and protected deletion without probing', async () => {
    const fixture = createFixture();
    fixture.outcomes.push(healthyProbe(), healthyProbe());
    const first = await fixture.service.create(createInput(1));
    const second = await fixture.service.create(createInput(2));

    expectErrorCode(
      () =>
        fixture.service.list({
          limit: 1,
          cursor: 'not-a-cursor',
        }),
      'INVALID_CURSOR',
    );
    const firstPage = fixture.service.list({ limit: 1 });
    const secondPage = fixture.service.list({
      limit: 1,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(firstPage.items.map((node) => node.id)).toEqual([second.id]);
    expect(secondPage.items.map((node) => node.id)).toEqual([first.id]);

    await expect(
      fixture.service.create({ ...createInput(3), name: first.name }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      fixture.service.update(second.id, { host: first.host }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    fixture.connection.sqlite
      .prepare(
        `insert into managed_clients
         (id, name, expires_at, enabled, lifecycle_status, created_at, updated_at)
         values (?, ?, null, 1, 'active', ?, ?)`,
      )
      .run(
        '10000000-0000-4000-8000-000000000001',
        'Synthetic managed client',
        Date.parse('2026-09-27T10:00:00.000Z'),
        Date.parse('2026-09-27T10:00:00.000Z'),
      );
    fixture.connection.sqlite
      .prepare(
        `insert into placements
         (id, managed_client_id, node_id, remote_client_id, desired_payload,
          status, last_error_code, last_attempt_at, created_at, updated_at)
         values (?, ?, ?, null, null, 'pending', null, null, ?, ?)`,
      )
      .run(
        '20000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        first.id,
        Date.parse('2026-09-27T10:00:00.000Z'),
        Date.parse('2026-09-27T10:00:00.000Z'),
      );

    expectErrorCode(() => fixture.service.delete(first.id), 'HAS_PLACEMENTS');
    fixture.service.delete(second.id);
    expectErrorCode(() => fixture.service.get(second.id), 'NOT_FOUND');
    expect(fixture.calls).toHaveLength(2);
  });

  it('binds stored ciphertext to the node identifier and field', async () => {
    const fixture = createFixture();
    fixture.outcomes.push(healthyProbe());
    const created = await fixture.service.create(createInput());
    const row = fixture.connection.sqlite
      .prepare(
        'select username_ciphertext, password_ciphertext from nodes where id = ?',
      )
      .get(created.id) as {
      username_ciphertext: string;
      password_ciphertext: string;
    };
    const cipher = new NodeCredentialCipher(MASTER_KEY);

    expect(
      cipher.decrypt(created.id, 'username', row.username_ciphertext),
    ).toBe('synthetic-admin-1');
    expect(() =>
      cipher.decrypt(created.id, 'password', row.username_ciphertext),
    ).toThrow('Credential decryption failed');
  });
});
