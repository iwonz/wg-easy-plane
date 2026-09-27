import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

const KEY_SALT = Buffer.from('wg-easy-plane/subscriptions/v1', 'utf8');
const CIPHERTEXT_VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const JWT_ISSUER = 'wg-easy-plane';
const JWT_AUDIENCE = 'wg-easy-plane-subscription';

export type SubscriptionSessionClaims = {
  managedClientId: string;
  tokenId: string;
  tokenVersion: number;
  jwtId: string;
};

function deriveKey(masterKey: Uint8Array, info: string): Uint8Array {
  if (masterKey.byteLength !== 32) {
    throw new Error('Subscription master key must contain 32 bytes');
  }
  return new Uint8Array(
    hkdfSync('sha256', masterKey, KEY_SALT, Buffer.from(info, 'utf8'), 32),
  );
}

function digest(key: Uint8Array, value: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('base64url');
}

function decodePart(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Subscription token decryption failed');
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) {
    throw new Error('Subscription token decryption failed');
  }
  return decoded;
}

function epochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export class SubscriptionCrypto {
  private readonly tokenHashKey: Uint8Array;
  private readonly tokenEncryptionKey: Uint8Array;
  private readonly sessionSigningKey: Uint8Array;
  private readonly rateLimitKey: Uint8Array;

  constructor(
    masterKey: Uint8Array,
    private readonly random: (size: number) => Uint8Array = randomBytes,
  ) {
    this.tokenHashKey = deriveKey(masterKey, 'token/hash');
    this.tokenEncryptionKey = deriveKey(masterKey, 'token/aes-256-gcm');
    this.sessionSigningKey = deriveKey(masterKey, 'session/jwt-signing');
    this.rateLimitKey = deriveKey(masterKey, 'exchange/rate-limit');
  }

  tokenDigest(token: string): string {
    return digest(this.tokenHashKey, token);
  }

  rateLimitIdentity(value: string): string {
    return digest(this.rateLimitKey, value);
  }

  encryptToken(tokenId: string, token: string): string {
    const iv = Buffer.from(this.random(IV_BYTES));
    if (iv.byteLength !== IV_BYTES) {
      throw new Error(
        'Subscription token IV source returned an invalid length',
      );
    }
    const cipher = createCipheriv('aes-256-gcm', this.tokenEncryptionKey, iv);
    cipher.setAAD(Buffer.from(`subscription:${tokenId}:token`, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(token, 'utf8'),
      cipher.final(),
    ]);
    return [
      CIPHERTEXT_VERSION,
      iv.toString('base64url'),
      ciphertext.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
    ].join('.');
  }

  decryptToken(tokenId: string, encoded: string): string {
    try {
      const parts = encoded.split('.');
      if (
        parts.length !== 4 ||
        parts[0] !== CIPHERTEXT_VERSION ||
        !parts[1] ||
        !parts[2] ||
        !parts[3]
      ) {
        throw new Error('invalid ciphertext');
      }
      const iv = decodePart(parts[1]);
      const ciphertext = decodePart(parts[2]);
      const tag = decodePart(parts[3]);
      if (iv.byteLength !== IV_BYTES || tag.byteLength !== TAG_BYTES) {
        throw new Error('invalid ciphertext');
      }
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.tokenEncryptionKey,
        iv,
      );
      decipher.setAAD(Buffer.from(`subscription:${tokenId}:token`, 'utf8'));
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error('Subscription token decryption failed');
    }
  }

  signSession(
    input: SubscriptionSessionClaims & {
      issuedAt: Date;
      expiresAt: Date;
    },
  ): Promise<string> {
    return new SignJWT({
      type: 'subscription',
      tokenId: input.tokenId,
      tokenVersion: input.tokenVersion,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setSubject(input.managedClientId)
      .setJti(input.jwtId)
      .setIssuedAt(epochSeconds(input.issuedAt))
      .setExpirationTime(epochSeconds(input.expiresAt))
      .sign(this.sessionSigningKey);
  }

  async verifySession(
    token: string,
    now: Date,
  ): Promise<SubscriptionSessionClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.sessionSigningKey, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        currentDate: now,
      });
      const managedClientId = requiredString(payload.sub);
      const tokenId = requiredString(payload.tokenId);
      const jwtId = requiredString(payload.jti);
      const tokenVersion = payload.tokenVersion;
      if (
        payload.type !== 'subscription' ||
        !managedClientId ||
        !tokenId ||
        !jwtId ||
        !Number.isSafeInteger(tokenVersion) ||
        (tokenVersion as number) < 1
      ) {
        return null;
      }
      return {
        managedClientId,
        tokenId,
        tokenVersion: tokenVersion as number,
        jwtId,
      };
    } catch {
      return null;
    }
  }
}
