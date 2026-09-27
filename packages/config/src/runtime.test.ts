import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ConfigError,
  defaultDatabasePath,
  parseRuntimeConfig,
} from './runtime';

const validKey = Buffer.alloc(32, 7).toString('base64');

describe('runtime configuration', () => {
  it('resolves the Linux data path outside the working directory', () => {
    expect(
      defaultDatabasePath({
        environment: {},
        platform: 'linux',
        homeDirectory: '/home/synthetic',
      }),
    ).toBe('/home/synthetic/.local/share/wg-easy-plane/wg-easy-plane.sqlite');
  });

  it('accepts an absolute override and parses numeric values', () => {
    const config = parseRuntimeConfig({
      APP_ENCRYPTION_KEY: validKey,
      DATABASE_PATH: path.resolve('/tmp', 'synthetic.sqlite'),
      SYNC_INTERVAL_SECONDS: '0',
      NODE_REQUEST_TIMEOUT_MS: '2500',
    });

    expect(config.syncIntervalSeconds).toBe(0);
    expect(config.nodeRequestTimeoutMs).toBe(2500);
    expect(config.appEncryptionKey.byteLength).toBe(32);
  });

  it('reports only the missing variable name', () => {
    expect(() => parseRuntimeConfig({})).toThrowError(ConfigError);
    expect(() => parseRuntimeConfig({})).toThrow('APP_ENCRYPTION_KEY');
  });

  it('rejects relative database paths', () => {
    expect(() =>
      parseRuntimeConfig({
        APP_ENCRYPTION_KEY: validKey,
        DATABASE_PATH: 'data/local.sqlite',
      }),
    ).toThrow('DATABASE_PATH');
  });
});
