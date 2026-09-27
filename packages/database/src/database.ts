import fs from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema';

export function prepareDatabasePath(databasePath: string): void {
  if (databasePath === ':memory:') return;

  const directory = path.dirname(databasePath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(directory, 0o700);
  } catch {
    // Some platforms do not support POSIX modes; OS ACLs remain authoritative.
  }
}

export type DatabaseConnection = {
  db: BetterSQLite3Database<typeof schema>;
  sqlite: BetterSqlite3.Database;
  close: () => void;
};

export function openDatabase(databasePath: string): DatabaseConnection {
  prepareDatabasePath(databasePath);
  const sqlite = new BetterSqlite3(databasePath, { timeout: 5_000 });
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  if (databasePath !== ':memory:') {
    try {
      fs.chmodSync(databasePath, 0o600);
    } catch {
      // See prepareDatabasePath: Windows permissions are managed by ACLs.
    }
  }

  return {
    db: drizzle(sqlite, { schema }),
    sqlite,
    close: () => sqlite.close(),
  };
}
