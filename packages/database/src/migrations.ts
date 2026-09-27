import fs from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';

import { openDatabase } from './database';

export function resolveDefaultMigrationsFolder(
  workingDirectory = process.cwd(),
): string {
  const packagedMigrations = path.resolve(workingDirectory, 'migrations');
  const candidates = [
    packagedMigrations,
    path.resolve(workingDirectory, 'packages/database/migrations'),
    path.resolve(workingDirectory, '../../packages/database/migrations'),
  ];
  return (
    candidates.find((candidate) =>
      fs.existsSync(path.join(candidate, 'meta/_journal.json')),
    ) ?? packagedMigrations
  );
}

export const defaultMigrationsFolder = resolveDefaultMigrationsFolder();

export function backupDatabase(databasePath: string, now = new Date()) {
  if (!fs.existsSync(databasePath) || fs.statSync(databasePath).size === 0) {
    return null;
  }

  const timestamp = now.toISOString().replaceAll(':', '-');
  const backupPath = `${databasePath}.backup-${timestamp}`;
  fs.copyFileSync(databasePath, backupPath, fs.constants.COPYFILE_EXCL);
  try {
    fs.chmodSync(backupPath, 0o600);
  } catch {
    // See database initialization note about Windows ACLs.
  }
  return backupPath;
}

export function migrateDatabase(
  databasePath: string,
  migrationsFolder = defaultMigrationsFolder,
) {
  const resolvedMigrationsFolder = path.resolve(migrationsFolder);
  if (!hasPendingMigrations(databasePath, resolvedMigrationsFolder)) {
    return { backupPath: null, migrated: false };
  }

  const backupPath = backupDatabase(databasePath);
  const connection = openDatabase(databasePath);
  try {
    migrate(connection.db, {
      migrationsFolder: resolvedMigrationsFolder,
    });
    return { backupPath, migrated: true };
  } finally {
    connection.close();
  }
}

export function hasPendingMigrations(
  databasePath: string,
  migrationsFolder = defaultMigrationsFolder,
): boolean {
  const migrations = readMigrationFiles({
    migrationsFolder: path.resolve(migrationsFolder),
  });
  if (migrations.length === 0) return false;
  if (!fs.existsSync(databasePath) || fs.statSync(databasePath).size === 0) {
    return true;
  }

  const sqlite = new BetterSqlite3(databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const migrationTable = sqlite
      .prepare(
        "select name from sqlite_master where type = 'table' and name = ?",
      )
      .get('__drizzle_migrations');
    if (!migrationTable) return true;

    const latest = sqlite
      .prepare(
        'select created_at from __drizzle_migrations order by created_at desc limit 1',
      )
      .get() as { created_at: number | string } | undefined;
    if (!latest) return true;

    const latestApplied = Number(latest.created_at);
    return migrations.some(
      (migration) => migration.folderMillis > latestApplied,
    );
  } finally {
    sqlite.close();
  }
}
