import { loadRuntimeConfig } from '@wg-easy-plane/config';
import { migrateDatabase } from '@wg-easy-plane/database/migrations';

export function preparePanelDatabase() {
  const config = loadRuntimeConfig();
  return migrateDatabase(config.databasePath, config.databaseMigrationsPath);
}
