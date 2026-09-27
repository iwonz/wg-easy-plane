import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { openDatabase } from './database';
import { checkDatabaseHealth } from './health';
import {
  backupDatabase,
  hasPendingMigrations,
  migrateDatabase,
  resolveDefaultMigrationsFolder,
} from './migrations';

const temporaryDirectories: string[] = [];

function temporaryDatabasePath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wgep-db-test-'));
  temporaryDirectories.push(directory);
  return path.join(directory, 'control-plane.sqlite');
}

function versionOneMigrationsFolder(databasePath: string): string {
  const source = resolveDefaultMigrationsFolder(process.cwd());
  const target = path.join(path.dirname(databasePath), 'v1-migrations');
  fs.mkdirSync(path.join(target, 'meta'), { recursive: true });
  for (const migration of [
    '0000_cold_famine.sql',
    '0001_wealthy_hellion.sql',
  ]) {
    fs.copyFileSync(path.join(source, migration), path.join(target, migration));
  }
  const journal = JSON.parse(
    fs.readFileSync(path.join(source, 'meta/_journal.json'), 'utf8'),
  ) as { entries: unknown[] } & Record<string, unknown>;
  fs.writeFileSync(
    path.join(target, 'meta/_journal.json'),
    JSON.stringify({ ...journal, entries: journal.entries.slice(0, 2) }),
  );
  return target;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('database lifecycle', () => {
  it('resolves source and packaged migration layouts', () => {
    expect(resolveDefaultMigrationsFolder(process.cwd())).toBe(
      path.resolve(process.cwd(), 'packages/database/migrations'),
    );
    expect(
      resolveDefaultMigrationsFolder(path.resolve(process.cwd(), 'apps/panel')),
    ).toBe(path.resolve(process.cwd(), 'packages/database/migrations'));
  });

  it('enables required pragmas and health queries', () => {
    const databasePath = temporaryDatabasePath();
    const connection = openDatabase(databasePath);

    expect(connection.sqlite.pragma('journal_mode', { simple: true })).toBe(
      'wal',
    );
    expect(connection.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(checkDatabaseHealth(connection)).toBe(true);
    connection.close();

    if (process.platform !== 'win32') {
      expect(fs.statSync(databasePath).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.dirname(databasePath)).mode & 0o777).toBe(0o700);
    }
  });

  it('creates a backup for a non-empty database', () => {
    const databasePath = temporaryDatabasePath();
    fs.writeFileSync(databasePath, 'synthetic');

    const backupPath = backupDatabase(
      databasePath,
      new Date('2026-01-02T03:04:05.000Z'),
    );

    expect(backupPath).toContain('.backup-2026-01-02T03-04-05.000Z');
    expect(fs.readFileSync(backupPath!, 'utf8')).toBe('synthetic');
  });

  it('backs up an existing valid database before applying pending migrations', () => {
    const databasePath = temporaryDatabasePath();
    const existing = openDatabase(databasePath);
    existing.sqlite.exec(
      "create table operator_marker (value text not null); insert into operator_marker values ('preserved')",
    );
    existing.close();

    const result = migrateDatabase(databasePath);

    expect(result.migrated).toBe(true);
    expect(result.backupPath).toMatch(/\.backup-/);
    const backup = new BetterSqlite3(result.backupPath!, {
      readonly: true,
      fileMustExist: true,
    });
    expect(
      backup.prepare('select value from operator_marker').pluck().get(),
    ).toBe('preserved');
    backup.close();
    if (process.platform !== 'win32') {
      expect(fs.statSync(result.backupPath!).mode & 0o777).toBe(0o600);
    }
  });

  it('removes the insecure TLS column and fails legacy exceptions closed without data loss', () => {
    const databasePath = temporaryDatabasePath();
    const v1Migrations = versionOneMigrationsFolder(databasePath);
    migrateDatabase(databasePath, v1Migrations);

    const v1 = openDatabase(databasePath);
    const timestamp = Date.parse('2026-09-27T10:00:00.000Z');
    const trustedNodeId = '00000000-0000-4000-8000-000000000001';
    const insecureNodeId = '00000000-0000-4000-8000-000000000002';
    const insertNode = v1.sqlite.prepare(
      `insert into nodes
       (id, name, protocol, host, port, username_ciphertext,
        password_ciphertext, allow_insecure_tls, status, detected_version,
        mode, last_checked_at, last_synced_at, last_error_code,
        created_at, updated_at)
       values (?, ?, 'https', ?, 443, 'synthetic-ciphertext',
               'synthetic-ciphertext', ?, 'healthy', '15.4.0', 'wireguard',
               ?, ?, null, ?, ?)`,
    );
    insertNode.run(
      trustedNodeId,
      'Trusted synthetic node',
      'trusted.example.test',
      0,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
    );
    insertNode.run(
      insecureNodeId,
      'Legacy synthetic node',
      'legacy.example.test',
      1,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
    );
    v1.sqlite
      .prepare(
        `insert into remote_clients
         (node_id, remote_client_id, name, public_data, snapshot_hash,
          upstream_version, first_seen_at, last_seen_at, missing_at)
         values (?, 7, 'Synthetic remote client', '{}', 'synthetic-hash',
                 '15.4.0', ?, ?, null)`,
      )
      .run(insecureNodeId, timestamp, timestamp);
    v1.sqlite
      .prepare(
        `insert into managed_clients
         (id, name, expires_at, enabled, lifecycle_status, created_at, updated_at)
         values ('10000000-0000-4000-8000-000000000001',
                 'Synthetic managed client', null, 1, 'active', ?, ?)`,
      )
      .run(timestamp, timestamp);
    v1.sqlite
      .prepare(
        `insert into placements
         (id, managed_client_id, node_id, remote_client_id, desired_payload,
          status, last_error_code, last_attempt_at, created_at, updated_at)
         values ('20000000-0000-4000-8000-000000000001',
                 '10000000-0000-4000-8000-000000000001', ?, 7, '{}',
                 'active', null, ?, ?, ?)`,
      )
      .run(insecureNodeId, timestamp, timestamp, timestamp);
    v1.close();

    const result = migrateDatabase(databasePath);
    expect(result.migrated).toBe(true);
    expect(result.backupPath).toMatch(/\.backup-/);

    const migrated = openDatabase(databasePath);
    const nodeColumns = migrated.sqlite
      .prepare('pragma table_info(nodes)')
      .all()
      .map((column) => (column as { name: string }).name);
    expect(nodeColumns).not.toContain('allow_insecure_tls');
    expect(
      migrated.sqlite
        .prepare(
          'select id, status, detected_version, mode, last_synced_at, last_error_code from nodes order by id',
        )
        .all(),
    ).toEqual([
      {
        id: trustedNodeId,
        status: 'healthy',
        detected_version: '15.4.0',
        mode: 'wireguard',
        last_synced_at: timestamp,
        last_error_code: null,
      },
      {
        id: insecureNodeId,
        status: 'tls_error',
        detected_version: '15.4.0',
        mode: 'wireguard',
        last_synced_at: timestamp,
        last_error_code: 'TLS_ERROR',
      },
    ]);
    expect(
      migrated.sqlite
        .prepare('select count(*) from remote_clients')
        .pluck()
        .get(),
    ).toBe(1);
    expect(
      migrated.sqlite.prepare('select count(*) from placements').pluck().get(),
    ).toBe(1);
    expect(migrated.sqlite.pragma('foreign_key_check')).toEqual([]);
    migrated.close();

    const backup = new BetterSqlite3(result.backupPath!, {
      readonly: true,
      fileMustExist: true,
    });
    expect(
      backup
        .prepare('select allow_insecure_tls from nodes where id = ?')
        .pluck()
        .get(insecureNodeId),
    ).toBe(1);
    backup.close();
  });

  it('applies the initial migration and exposes core tables', () => {
    const databasePath = temporaryDatabasePath();
    expect(hasPendingMigrations(databasePath)).toBe(true);
    const firstMigration = migrateDatabase(databasePath);
    expect(firstMigration).toEqual({ backupPath: null, migrated: true });
    expect(hasPendingMigrations(databasePath)).toBe(false);

    const secondMigration = migrateDatabase(databasePath);
    expect(secondMigration).toEqual({ backupPath: null, migrated: false });
    expect(
      fs
        .readdirSync(path.dirname(databasePath))
        .filter((name) => name.includes('.backup-')),
    ).toEqual([]);

    const connection = openDatabase(databasePath);

    const tables = connection.sqlite
      .prepare("select name from sqlite_master where type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toContain('admins');
    expect(tables).toContain('nodes');
    expect(tables).toContain('managed_clients');
    expect(tables).toContain('placements');

    const indexes = connection.sqlite
      .prepare("select name from sqlite_master where type = 'index'")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(indexes).toContain('refresh_sessions_family_idx');
    expect(indexes).toContain('rate_limits_reset_idx');
    connection.close();
  });
});
