import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('generated API client artifacts', () => {
  it('contain the versioned system endpoint', async () => {
    const source = await readFile(
      path.resolve('packages/api-client/src/schema.d.ts'),
      'utf8',
    );

    expect(source).toContain("'/api/v1/system/status'");
  });
});
