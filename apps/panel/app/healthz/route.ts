import { loadRuntimeConfig } from '@wg-easy-plane/config';
import { checkDatabaseHealth, openDatabase } from '@wg-easy-plane/database';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET() {
  try {
    const config = loadRuntimeConfig();
    const connection = openDatabase(config.databasePath);
    try {
      if (!checkDatabaseHealth(connection)) {
        throw new Error('Database health query failed');
      }
      return Response.json(
        { status: 'ok' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } finally {
      connection.close();
    }
  } catch {
    return Response.json(
      { status: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
