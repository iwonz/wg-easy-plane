import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { openDatabase } from './database';

export const defaultMigrationsFolder = fileURLToPath(
  new URL('../migrations', import.meta.url),
);

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
  const backupPath = backupDatabase(databasePath);
  const connection = openDatabase(databasePath);
  try {
    migrate(connection.db, {
      migrationsFolder: path.resolve(migrationsFolder),
    });
    return { backupPath };
  } finally {
    connection.close();
  }
}
