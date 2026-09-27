import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../app/healthz/route';

const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('/healthz', () => {
  it('returns a generic healthy response', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wgep-health-'));
    temporaryDirectories.push(directory);
    vi.stubEnv('APP_ENCRYPTION_KEY', Buffer.alloc(32, 9).toString('base64'));
    vi.stubEnv('DATABASE_PATH', path.join(directory, 'health.sqlite'));

    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('does not expose configuration errors', async () => {
    vi.stubEnv('APP_ENCRYPTION_KEY', 'invalid');
    vi.stubEnv('DATABASE_PATH', 'relative.sqlite');

    const response = GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: 'unavailable' });
  });
});
