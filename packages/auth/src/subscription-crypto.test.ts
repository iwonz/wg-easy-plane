import { describe, expect, it } from 'vitest';

import { SubscriptionCrypto } from './subscription-crypto';

const MASTER_KEY = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const TOKEN_ID = '10000000-0000-4000-8000-000000000001';
const CLIENT_ID = '20000000-0000-4000-8000-000000000001';

describe('SubscriptionCrypto', () => {
  it('uses separate deterministic digest domains and authenticated encryption', () => {
    const crypto = new SubscriptionCrypto(MASTER_KEY, (size) =>
      Uint8Array.from({ length: size }, () => 7),
    );
    const token = `wgep_sub_${'a'.repeat(43)}`;
    const ciphertext = crypto.encryptToken(TOKEN_ID, token);

    expect(ciphertext).not.toContain(token);
    expect(crypto.decryptToken(TOKEN_ID, ciphertext)).toBe(token);
    expect(crypto.tokenDigest(token)).not.toBe(crypto.rateLimitIdentity(token));
    expect(() =>
      crypto.decryptToken('10000000-0000-4000-8000-000000000002', ciphertext),
    ).toThrow('Subscription token decryption failed');
  });

  it('signs only valid expiring subscription claims', async () => {
    const crypto = new SubscriptionCrypto(MASTER_KEY);
    const issuedAt = new Date('2026-09-27T10:00:00.000Z');
    const token = await crypto.signSession({
      managedClientId: CLIENT_ID,
      tokenId: TOKEN_ID,
      tokenVersion: 3,
      jwtId: '30000000-0000-4000-8000-000000000001',
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + 60_000),
    });

    await expect(
      crypto.verifySession(token, new Date(issuedAt.getTime() + 30_000)),
    ).resolves.toMatchObject({
      managedClientId: CLIENT_ID,
      tokenId: TOKEN_ID,
      tokenVersion: 3,
    });
    await expect(
      crypto.verifySession(token, new Date(issuedAt.getTime() + 61_000)),
    ).resolves.toBeNull();
  });
});
