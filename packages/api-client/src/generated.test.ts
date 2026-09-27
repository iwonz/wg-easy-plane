import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('generated API client artifacts', () => {
  it('contain the versioned system endpoint', async () => {
    const source = await readFile(
      path.resolve('packages/api-client/src/schema.d.ts'),
      'utf8',
    );

    for (const path of [
      '/api/v1/system/status',
      '/api/v1/auth/setup/status',
      '/api/v1/auth/setup',
      '/api/v1/auth/login',
      '/api/v1/auth/refresh',
      '/api/v1/auth/logout',
      '/api/v1/auth/me',
    ]) {
      expect(source).toContain(`'${path}'`);
    }
  });
});
