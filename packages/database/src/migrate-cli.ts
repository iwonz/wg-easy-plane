import { loadRuntimeConfig } from '@wg-easy-plane/config';

import { migrateDatabase } from './migrations';

const config = loadRuntimeConfig();
const result = migrateDatabase(
  config.databasePath,
  config.databaseMigrationsPath,
);

process.stdout.write(
  !result.migrated
    ? 'Database is already current.\n'
    : result.backupPath
      ? 'Database backup created and migrations applied.\n'
      : 'Migrations applied.\n',
);
