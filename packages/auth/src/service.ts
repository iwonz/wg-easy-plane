import { randomUUID } from 'node:crypto';
import type { DatabaseConnection } from '@wg-easy-plane/database';

import {
  deriveAuthKeys,
  hashPassword,
  keyedDigest,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyPassword,
  verifyRefreshToken,
} from './crypto';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,64}$/;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

type AuthErrorCode =
  | 'INVALID_INPUT'
  | 'SETUP_COMPLETE'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'REFRESH_REUSED'
  | 'RATE_LIMITED';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(
    code: AuthErrorCode,
    message: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type PublicAdmin = {
  id: string;
  username: string;
};

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
};

export type AuthenticatedSession = {
  admin: PublicAdmin;
  tokens: SessionTokens;
};

type AdminRow = {
  id: string;
  username: string;
  password_hash: string;
};

type RefreshRow = {
  id: string;
  admin_id: string;
  family_id: string;
  token_hash: string;
  expires_at: number;
  rotated_at: number | null;
  revoked_at: number | null;
};

type RateLimitRow = {
  attempts: number;
  reset_at: number;
};

type PendingSession = SessionTokens & {
  sessionId: string;
  familyId: string;
  refreshIdentifierHash: string;
};

type RateLimitPolicy = {
  limit: number;
  windowMs: number;
};

const SETUP_RATE_LIMIT: RateLimitPolicy = {
  limit: 5,
  windowMs: 15 * 60 * 1000,
};
const LOGIN_RATE_LIMIT: RateLimitPolicy = {
  limit: 5,
  windowMs: 15 * 60 * 1000,
};
const REFRESH_RATE_LIMIT: RateLimitPolicy = {
  limit: 20,
  windowMs: 15 * 60 * 1000,
};

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function assertCredentialPolicy(username: string, password: string): void {
  if (
    !USERNAME_PATTERN.test(username) ||
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw new AuthError('INVALID_INPUT', 'Credentials do not meet policy');
  }
}

export class AuthService {
  private readonly keys;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly dummyPasswordHash: Promise<string>;

  constructor(
    private readonly connection: DatabaseConnection,
    options: {
      masterKey: Uint8Array;
      now?: () => Date;
      newId?: () => string;
    },
  ) {
    this.keys = deriveAuthKeys(options.masterKey);
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? randomUUID;
    this.dummyPasswordHash = hashPassword(
      'synthetic-unavailable-administrator-credential',
    );
  }

  getSetupStatus(): { setupRequired: boolean } {
    const row = this.connection.sqlite
      .prepare('select count(*) as count from admins')
      .get() as { count: number };
    return { setupRequired: row.count === 0 };
  }

  async setup(input: {
    username: string;
    password: string;
  }): Promise<AuthenticatedSession> {
    const username = normalizeUsername(input.username);
    assertCredentialPolicy(username, input.password);

    if (!this.getSetupStatus().setupRequired) {
      throw new AuthError(
        'SETUP_COMPLETE',
        'Administrator setup is already complete',
      );
    }

    this.consumeRateLimit('setup', 'global', SETUP_RATE_LIMIT);
    const [passwordHash, adminId] = await Promise.all([
      hashPassword(input.password),
      Promise.resolve(this.newId()),
    ]);
    const pendingSession = await this.createPendingSession(adminId);
    const nowMs = this.now().getTime();

    const create = this.connection.sqlite.transaction(() => {
      const row = this.connection.sqlite
        .prepare('select count(*) as count from admins')
        .get() as { count: number };
      if (row.count !== 0) {
        throw new AuthError(
          'SETUP_COMPLETE',
          'Administrator setup is already complete',
        );
      }

      this.connection.sqlite
        .prepare(
          `insert into admins (id, username, password_hash, created_at, updated_at)
           values (?, ?, ?, ?, ?)`,
        )
        .run(adminId, username, passwordHash, nowMs, nowMs);
      this.insertRefreshSession(adminId, pendingSession, nowMs);
    });

    create.immediate();
    return {
      admin: { id: adminId, username },
      tokens: this.publicTokens(pendingSession),
    };
  }

  async login(input: {
    username: string;
    password: string;
  }): Promise<AuthenticatedSession> {
    const username = normalizeUsername(input.username);
    if (username.length === 0 || input.password.length === 0) {
      throw new AuthError(
        'INVALID_CREDENTIALS',
        'Invalid username or password',
      );
    }

    this.consumeRateLimit('login', username, LOGIN_RATE_LIMIT);
    const admin = this.connection.sqlite
      .prepare(
        'select id, username, password_hash from admins where username = ? limit 1',
      )
      .get(username) as AdminRow | undefined;
    const passwordHash = admin?.password_hash ?? (await this.dummyPasswordHash);
    const valid = await verifyPassword(passwordHash, input.password);

    if (!admin || !valid) {
      throw new AuthError(
        'INVALID_CREDENTIALS',
        'Invalid username or password',
      );
    }

    this.clearRateLimit('login', username);
    const pendingSession = await this.createPendingSession(admin.id);
    this.insertRefreshSession(admin.id, pendingSession, this.now().getTime());

    return {
      admin: { id: admin.id, username: admin.username },
      tokens: this.publicTokens(pendingSession),
    };
  }

  async currentAdmin(accessToken: string | undefined): Promise<PublicAdmin> {
    if (!accessToken) {
      throw new AuthError('UNAUTHORIZED', 'Authentication is required');
    }
    const claims = await verifyAccessToken({
      key: this.keys.jwtSigning,
      token: accessToken,
      now: this.now(),
    });
    if (!claims) {
      throw new AuthError('UNAUTHORIZED', 'Authentication is required');
    }

    const admin = this.connection.sqlite
      .prepare('select id, username from admins where id = ? limit 1')
      .get(claims.subject) as PublicAdmin | undefined;
    if (!admin) {
      throw new AuthError('UNAUTHORIZED', 'Authentication is required');
    }
    return admin;
  }

  async refresh(refreshToken: string | undefined): Promise<SessionTokens> {
    const now = this.now();
    if (!refreshToken) {
      this.consumeRateLimit('refresh', 'invalid', REFRESH_RATE_LIMIT);
      throw new AuthError('UNAUTHORIZED', 'Authentication is required');
    }

    const claims = await verifyRefreshToken({
      key: this.keys.jwtSigning,
      token: refreshToken,
      now,
    });
    if (!claims) {
      this.consumeRateLimit('refresh', 'invalid', REFRESH_RATE_LIMIT);
      throw new AuthError('UNAUTHORIZED', 'Authentication is required');
    }

    this.consumeRateLimit('refresh', claims.jwtId, REFRESH_RATE_LIMIT);
    const tokenHash = keyedDigest(this.keys.refreshIdentifier, claims.jwtId);
    const successor = await this.createPendingSession(
      claims.subject,
      claims.familyId,
    );
    const nowMs = now.getTime();

    const rotate = this.connection.sqlite.transaction(() => {
      const current = this.connection.sqlite
        .prepare(
          `select id, admin_id, family_id, token_hash, expires_at, rotated_at, revoked_at
           from refresh_sessions where token_hash = ? limit 1`,
        )
        .get(tokenHash) as RefreshRow | undefined;

      if (!current) return 'unauthorized' as const;
      if (current.rotated_at !== null) {
        this.connection.sqlite
          .prepare(
            `update refresh_sessions set revoked_at = coalesce(revoked_at, ?)
             where family_id = ?`,
          )
          .run(nowMs, current.family_id);
        return 'replayed' as const;
      }
      if (
        current.revoked_at !== null ||
        current.expires_at <= nowMs ||
        current.id !== claims.sessionId ||
        current.admin_id !== claims.subject ||
        current.family_id !== claims.familyId
      ) {
        return 'unauthorized' as const;
      }

      this.connection.sqlite
        .prepare('update refresh_sessions set rotated_at = ? where id = ?')
        .run(nowMs, current.id);
      this.insertRefreshSession(current.admin_id, successor, nowMs);
      return 'rotated' as const;
    });

    const result = rotate.immediate();
    if (result === 'replayed') {
      throw new AuthError(
        'REFRESH_REUSED',
        'Refresh session can no longer be used',
      );
    }
    if (result !== 'rotated') {
      throw new AuthError('UNAUTHORIZED', 'Authentication is required');
    }

    return this.publicTokens(successor);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const claims = await verifyRefreshToken({
      key: this.keys.jwtSigning,
      token: refreshToken,
      now: this.now(),
      allowExpired: true,
    });
    if (!claims) return;

    this.connection.sqlite
      .prepare(
        `update refresh_sessions set revoked_at = coalesce(revoked_at, ?)
         where family_id = ?`,
      )
      .run(this.now().getTime(), claims.familyId);
  }

  private consumeRateLimit(
    bucket: string,
    identity: string,
    policy: RateLimitPolicy,
  ): void {
    const key = keyedDigest(
      this.keys.rateLimitIdentity,
      `${bucket}:${identity}`,
    );
    const nowMs = this.now().getTime();
    const consume = this.connection.sqlite.transaction(() => {
      this.connection.sqlite
        .prepare('delete from rate_limits where reset_at <= ?')
        .run(nowMs);
      const current = this.connection.sqlite
        .prepare(
          'select attempts, reset_at from rate_limits where key = ? and bucket = ?',
        )
        .get(key, bucket) as RateLimitRow | undefined;

      if (!current) {
        this.connection.sqlite
          .prepare(
            'insert into rate_limits (key, bucket, attempts, reset_at) values (?, ?, ?, ?)',
          )
          .run(key, bucket, 1, nowMs + policy.windowMs);
        return null;
      }

      if (current.attempts >= policy.limit) {
        return Math.max(1, Math.ceil((current.reset_at - nowMs) / 1000));
      }

      this.connection.sqlite
        .prepare(
          'update rate_limits set attempts = attempts + 1 where key = ? and bucket = ?',
        )
        .run(key, bucket);
      return null;
    });

    const retryAfterSeconds = consume.immediate();
    if (retryAfterSeconds !== null) {
      throw new AuthError(
        'RATE_LIMITED',
        'Too many authentication attempts',
        retryAfterSeconds,
      );
    }
  }

  private clearRateLimit(bucket: string, identity: string): void {
    const key = keyedDigest(
      this.keys.rateLimitIdentity,
      `${bucket}:${identity}`,
    );
    this.connection.sqlite
      .prepare('delete from rate_limits where key = ? and bucket = ?')
      .run(key, bucket);
  }

  private async createPendingSession(
    adminId: string,
    familyId = this.newId(),
  ): Promise<PendingSession> {
    const issuedAt = this.now();
    const accessExpiresAt = new Date(
      issuedAt.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000,
    );
    const refreshExpiresAt = new Date(
      issuedAt.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000,
    );
    const sessionId = this.newId();
    const accessIdentifier = this.newId();
    const refreshIdentifier = this.newId();
    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken({
        key: this.keys.jwtSigning,
        adminId,
        sessionId,
        jwtId: accessIdentifier,
        issuedAt,
        expiresAt: accessExpiresAt,
      }),
      signRefreshToken({
        key: this.keys.jwtSigning,
        adminId,
        sessionId,
        familyId,
        jwtId: refreshIdentifier,
        issuedAt,
        expiresAt: refreshExpiresAt,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      accessExpiresAt,
      refreshExpiresAt,
      sessionId,
      familyId,
      refreshIdentifierHash: keyedDigest(
        this.keys.refreshIdentifier,
        refreshIdentifier,
      ),
    };
  }

  private insertRefreshSession(
    adminId: string,
    session: PendingSession,
    createdAt: number,
  ): void {
    this.connection.sqlite
      .prepare(
        `insert into refresh_sessions
         (id, admin_id, family_id, token_hash, expires_at, created_at)
         values (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        session.sessionId,
        adminId,
        session.familyId,
        session.refreshIdentifierHash,
        session.refreshExpiresAt.getTime(),
        createdAt,
      );
  }

  private publicTokens(session: PendingSession): SessionTokens {
    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      accessExpiresAt: session.accessExpiresAt,
      refreshExpiresAt: session.refreshExpiresAt,
    };
  }
}
