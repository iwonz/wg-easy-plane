import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { openDatabase } from './database';
import { checkDatabaseHealth } from './health';
import { backupDatabase, migrateDatabase } from './migrations';

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

  it('applies the initial migration and exposes core tables', () => {
    const databasePath = temporaryDatabasePath();
    migrateDatabase(databasePath);
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
