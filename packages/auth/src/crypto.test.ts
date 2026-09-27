import { describe, expect, it } from 'vitest';

import {
  deriveAuthKeys,
  hashPassword,
  keyedDigest,
  verifyPassword,
} from './crypto';

describe('authentication cryptography', () => {
  it('hashes passwords with Argon2id without retaining plaintext', async () => {
    const password = 'synthetic-password-123';
    const passwordHash = await hashPassword(password);

    expect(passwordHash).toMatch(/^\$argon2id\$/);
    expect(passwordHash).not.toContain(password);
    await expect(verifyPassword(passwordHash, password)).resolves.toBe(true);
    await expect(verifyPassword(passwordHash, 'wrong-password')).resolves.toBe(
      false,
    );
  });

  it('derives independent purpose-bound keys and stable keyed digests', () => {
    const keys = deriveAuthKeys(Buffer.alloc(32, 5));

    expect(Buffer.from(keys.jwtSigning)).not.toEqual(
      Buffer.from(keys.refreshIdentifier),
    );
    expect(Buffer.from(keys.refreshIdentifier)).not.toEqual(
      Buffer.from(keys.rateLimitIdentity),
    );
    expect(Buffer.from(keys.apiToken)).not.toEqual(
      Buffer.from(keys.refreshIdentifier),
    );
    expect(keyedDigest(keys.refreshIdentifier, 'synthetic-id')).toBe(
      keyedDigest(keys.refreshIdentifier, 'synthetic-id'),
    );
    expect(keyedDigest(keys.refreshIdentifier, 'synthetic-id')).not.toBe(
      keyedDigest(keys.rateLimitIdentity, 'synthetic-id'),
    );
    expect(keyedDigest(keys.apiToken, 'synthetic-id')).not.toBe(
      keyedDigest(keys.refreshIdentifier, 'synthetic-id'),
    );
  });
});
