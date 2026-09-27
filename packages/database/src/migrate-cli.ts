import { loadRuntimeConfig } from '@wg-easy-plane/config';

import { migrateDatabase } from './migrations';

const config = loadRuntimeConfig();
const result = migrateDatabase(config.databasePath);

process.stdout.write(
  result.backupPath
    ? 'Database backup created and migrations applied.\n'
    : 'Migrations applied.\n',
);
