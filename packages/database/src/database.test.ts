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
