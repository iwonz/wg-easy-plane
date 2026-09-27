import { createHmac, hkdfSync } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { jwtVerify, SignJWT } from 'jose';

const KEY_SALT = Buffer.from('wg-easy-plane/auth/v1', 'utf8');
const JWT_ISSUER = 'wg-easy-plane';
const JWT_AUDIENCE = 'wg-easy-plane-panel';

const passwordOptions = {
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export type AuthKeys = {
  jwtSigning: Uint8Array;
  refreshIdentifier: Uint8Array;
  rateLimitIdentity: Uint8Array;
};

export type AccessClaims = {
  type: 'access';
  subject: string;
  sessionId: string;
  jwtId: string;
};

export type RefreshClaims = {
  type: 'refresh';
  subject: string;
  sessionId: string;
  familyId: string;
  jwtId: string;
};

function deriveKey(masterKey: Uint8Array, info: string): Uint8Array {
  return new Uint8Array(
    hkdfSync('sha256', masterKey, KEY_SALT, Buffer.from(info, 'utf8'), 32),
  );
}

export function deriveAuthKeys(masterKey: Uint8Array): AuthKeys {
  if (masterKey.byteLength !== 32) {
    throw new Error('Authentication master key must contain 32 bytes');
  }

  return {
    jwtSigning: deriveKey(masterKey, 'auth/jwt-signing'),
    refreshIdentifier: deriveKey(masterKey, 'auth/refresh-id'),
    rateLimitIdentity: deriveKey(masterKey, 'auth/rate-limit-key'),
  };
}

export function keyedDigest(key: Uint8Array, value: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('base64url');
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, passwordOptions);
}

export function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  return verify(passwordHash, password);
}

function epochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

export function signAccessToken(input: {
  key: Uint8Array;
  adminId: string;
  sessionId: string;
  jwtId: string;
  issuedAt: Date;
  expiresAt: Date;
}): Promise<string> {
  return new SignJWT({ type: 'access', sid: input.sessionId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setSubject(input.adminId)
    .setJti(input.jwtId)
    .setIssuedAt(epochSeconds(input.issuedAt))
    .setExpirationTime(epochSeconds(input.expiresAt))
    .sign(input.key);
}

export function signRefreshToken(input: {
  key: Uint8Array;
  adminId: string;
  sessionId: string;
  familyId: string;
  jwtId: string;
  issuedAt: Date;
  expiresAt: Date;
}): Promise<string> {
  return new SignJWT({
    type: 'refresh',
    sid: input.sessionId,
    familyId: input.familyId,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setSubject(input.adminId)
    .setJti(input.jwtId)
    .setIssuedAt(epochSeconds(input.issuedAt))
    .setExpirationTime(epochSeconds(input.expiresAt))
    .sign(input.key);
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export async function verifyAccessToken(input: {
  key: Uint8Array;
  token: string;
  now: Date;
}): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(input.token, input.key, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      currentDate: input.now,
    });
    const subject = requiredString(payload.sub);
    const sessionId = requiredString(payload.sid);
    const jwtId = requiredString(payload.jti);
    if (payload.type !== 'access' || !subject || !sessionId || !jwtId) {
      return null;
    }
    return { type: 'access', subject, sessionId, jwtId };
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(input: {
  key: Uint8Array;
  token: string;
  now: Date;
  allowExpired?: boolean;
}): Promise<RefreshClaims | null> {
  try {
    const { payload } = await jwtVerify(input.token, input.key, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      currentDate: input.allowExpired ? new Date(0) : input.now,
    });
    const subject = requiredString(payload.sub);
    const sessionId = requiredString(payload.sid);
    const familyId = requiredString(payload.familyId);
    const jwtId = requiredString(payload.jti);
    if (
      payload.type !== 'refresh' ||
      !subject ||
      !sessionId ||
      !familyId ||
      !jwtId
    ) {
      return null;
    }
    return { type: 'refresh', subject, sessionId, familyId, jwtId };
  } catch {
    return null;
  }
}
