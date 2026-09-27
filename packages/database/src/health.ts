import type { DatabaseConnection } from './database';

export function checkDatabaseHealth(connection: DatabaseConnection): boolean {
  const result = connection.sqlite.prepare('select 1 as healthy').get() as {
    healthy?: number;
  };
  return result.healthy === 1;
}
