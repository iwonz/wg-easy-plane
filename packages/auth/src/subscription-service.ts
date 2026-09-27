import { randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseConnection } from '@wg-easy-plane/database';

import { SubscriptionCrypto } from './subscription-crypto';

export const SUBSCRIPTION_SESSION_TTL_SECONDS = 12 * 60 * 60;

const SUBSCRIPTION_TOKEN_PATTERN = /^wgep_sub_[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXCHANGE_RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };

export type SubscriptionErrorCode =
  'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'UNAUTHORIZED' | 'RATE_LIMITED';

export class SubscriptionError extends Error {
  constructor(
    readonly code: SubscriptionErrorCode,
    readonly retryAfterSeconds?: number,
  ) {
    super('Subscription access failed');
    this.name = 'SubscriptionError';
  }
}

export type SubscriptionLink = {
  clientId: string;
  status: 'missing' | 'active' | 'revoked';
  prefix: string | null;
  url: string | null;
  version: number | null;
  createdAt: string | null;
  rotatedAt: string | null;
  revokedAt: string | null;
};

export type SubscriptionSession = {
  token: string;
  expiresAt: Date;
};

export type SubscriptionPrincipal = {
  kind: 'subscription';
  managedClientId: string;
  tokenId: string;
  tokenVersion: number;
};

type TokenRow = {
  id: string;
  managed_client_id: string;
  token_prefix: string;
  token_hash: string;
  token_ciphertext: string;
  version: number;
  revoked_at: number | null;
  rotated_at: number | null;
  created_at: number;
};

type RateLimitRow = { attempts: number; reset_at: number };

export class SubscriptionService {
  private readonly crypto: SubscriptionCrypto;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly random: (size: number) => Uint8Array;

  constructor(
    private readonly connection: DatabaseConnection,
    private readonly options: {
      masterKey: Uint8Array;
      subscriptionPublicUrl?: URL;
      now?: () => Date;
      newId?: () => string;
      randomBytes?: (size: number) => Uint8Array;
    },
  ) {
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? randomUUID;
    this.random = options.randomBytes ?? randomBytes;
    this.crypto = new SubscriptionCrypto(options.masterKey, this.random);
  }

  getLink(clientId: string): SubscriptionLink {
    this.#assertClient(clientId);
    const row = this.#tokenForClient(clientId);
    return this.#linkFromRow(clientId, row);
  }

  rotate(clientId: string): SubscriptionLink {
    if (!UUID_PATTERN.test(clientId))
      throw new SubscriptionError('INVALID_INPUT');
    if (!this.options.subscriptionPublicUrl) {
      throw new SubscriptionError('CONFLICT');
    }
    const randomPart = Buffer.from(this.random(32)).toString('base64url');
    if (randomPart.length !== 43) {
      throw new Error('Subscription token source must return exactly 32 bytes');
    }
    const token = `wgep_sub_${randomPart}`;
    const nowMs = this.now().getTime();

    const rotate = this.connection.sqlite.transaction(() => {
      this.#assertClient(clientId, true);
      const current = this.#tokenForClient(clientId);
      const tokenId = current?.id ?? this.newId();
      const version = (current?.version ?? 0) + 1;
      const prefix = `wgep_sub_${randomPart.slice(0, 8)}`;
      const tokenHash = this.crypto.tokenDigest(token);
      const ciphertext = this.crypto.encryptToken(tokenId, token);

      if (current) {
        this.connection.sqlite
          .prepare(
            `update subscription_tokens
             set token_prefix = ?, token_hash = ?, token_ciphertext = ?,
                 version = ?, revoked_at = null, rotated_at = ?
             where id = ?`,
          )
          .run(prefix, tokenHash, ciphertext, version, nowMs, tokenId);
      } else {
        this.connection.sqlite
          .prepare(
            `insert into subscription_tokens
             (id, managed_client_id, token_prefix, token_hash,
              token_ciphertext, version, revoked_at, rotated_at, created_at)
             values (?, ?, ?, ?, ?, ?, null, null, ?)`,
          )
          .run(
            tokenId,
            clientId,
            prefix,
            tokenHash,
            ciphertext,
            version,
            nowMs,
          );
      }
      return this.#tokenForClient(clientId);
    });

    const row = rotate.immediate();
    if (!row) throw new Error('Rotated subscription token was not persisted');
    return this.#linkFromRow(clientId, row);
  }

  revoke(clientId: string): void {
    this.#assertClient(clientId);
    const result = this.connection.sqlite
      .prepare(
        `update subscription_tokens
         set revoked_at = coalesce(revoked_at, ?)
         where managed_client_id = ?`,
      )
      .run(this.now().getTime(), clientId);
    if (result.changes === 0) throw new SubscriptionError('NOT_FOUND');
  }

  async exchange(token: string): Promise<SubscriptionSession> {
    const rateLimitIdentity = this.crypto.rateLimitIdentity(token);
    this.#consumeExchangeRateLimit(rateLimitIdentity);
    if (!SUBSCRIPTION_TOKEN_PATTERN.test(token)) {
      throw new SubscriptionError('UNAUTHORIZED');
    }
    const row = this.connection.sqlite
      .prepare(
        `select id, managed_client_id, token_prefix, token_hash,
                token_ciphertext, version, revoked_at, rotated_at, created_at
         from subscription_tokens where token_hash = ? limit 1`,
      )
      .get(this.crypto.tokenDigest(token)) as TokenRow | undefined;
    if (!row || row.revoked_at !== null) {
      throw new SubscriptionError('UNAUTHORIZED');
    }

    const issuedAt = this.now();
    const expiresAt = new Date(
      issuedAt.getTime() + SUBSCRIPTION_SESSION_TTL_SECONDS * 1000,
    );
    const sessionToken = await this.crypto.signSession({
      managedClientId: row.managed_client_id,
      tokenId: row.id,
      tokenVersion: row.version,
      jwtId: this.newId(),
      issuedAt,
      expiresAt,
    });
    this.#clearExchangeRateLimit(rateLimitIdentity);
    return { token: sessionToken, expiresAt };
  }

  async authenticateSession(
    sessionToken: string | undefined,
  ): Promise<SubscriptionPrincipal> {
    if (!sessionToken) throw new SubscriptionError('UNAUTHORIZED');
    const claims = await this.crypto.verifySession(sessionToken, this.now());
    if (!claims) throw new SubscriptionError('UNAUTHORIZED');
    const row = this.connection.sqlite
      .prepare(
        `select managed_client_id, version, revoked_at
         from subscription_tokens where id = ? limit 1`,
      )
      .get(claims.tokenId) as
      | {
          managed_client_id: string;
          version: number;
          revoked_at: number | null;
        }
      | undefined;
    if (
      !row ||
      row.revoked_at !== null ||
      row.managed_client_id !== claims.managedClientId ||
      row.version !== claims.tokenVersion
    ) {
      throw new SubscriptionError('UNAUTHORIZED');
    }
    return {
      kind: 'subscription',
      managedClientId: claims.managedClientId,
      tokenId: claims.tokenId,
      tokenVersion: claims.tokenVersion,
    };
  }

  #assertClient(clientId: string, requireActive = false): void {
    if (!UUID_PATTERN.test(clientId))
      throw new SubscriptionError('INVALID_INPUT');
    const row = this.connection.sqlite
      .prepare(
        'select lifecycle_status from managed_clients where id = ? limit 1',
      )
      .get(clientId) as { lifecycle_status: string } | undefined;
    if (!row) throw new SubscriptionError('NOT_FOUND');
    if (requireActive && row.lifecycle_status !== 'active') {
      throw new SubscriptionError('CONFLICT');
    }
  }

  #tokenForClient(clientId: string): TokenRow | undefined {
    return this.connection.sqlite
      .prepare(
        `select id, managed_client_id, token_prefix, token_hash,
                token_ciphertext, version, revoked_at, rotated_at, created_at
         from subscription_tokens where managed_client_id = ? limit 1`,
      )
      .get(clientId) as TokenRow | undefined;
  }

  #linkFromRow(clientId: string, row: TokenRow | undefined): SubscriptionLink {
    if (!row) {
      return {
        clientId,
        status: 'missing',
        prefix: null,
        url: null,
        version: null,
        createdAt: null,
        rotatedAt: null,
        revokedAt: null,
      };
    }
    const active = row.revoked_at === null;
    let url: string | null = null;
    if (active && this.options.subscriptionPublicUrl) {
      const token = this.crypto.decryptToken(row.id, row.token_ciphertext);
      const link = new URL(this.options.subscriptionPublicUrl);
      link.hash = token;
      url = link.toString();
    }
    return {
      clientId,
      status: active ? 'active' : 'revoked',
      prefix: row.token_prefix,
      url,
      version: row.version,
      createdAt: new Date(row.created_at).toISOString(),
      rotatedAt:
        row.rotated_at === null ? null : new Date(row.rotated_at).toISOString(),
      revokedAt:
        row.revoked_at === null ? null : new Date(row.revoked_at).toISOString(),
    };
  }

  #consumeExchangeRateLimit(identity: string): void {
    const nowMs = this.now().getTime();
    const consume = this.connection.sqlite.transaction(() => {
      this.connection.sqlite
        .prepare('delete from rate_limits where reset_at <= ?')
        .run(nowMs);
      const current = this.connection.sqlite
        .prepare(
          `select attempts, reset_at from rate_limits
           where key = ? and bucket = 'subscription_exchange'`,
        )
        .get(identity) as RateLimitRow | undefined;
      if (!current) {
        this.connection.sqlite
          .prepare(
            `insert into rate_limits (key, bucket, attempts, reset_at)
             values (?, 'subscription_exchange', 1, ?)`,
          )
          .run(identity, nowMs + EXCHANGE_RATE_LIMIT.windowMs);
        return null;
      }
      if (current.attempts >= EXCHANGE_RATE_LIMIT.limit) {
        return Math.max(1, Math.ceil((current.reset_at - nowMs) / 1000));
      }
      this.connection.sqlite
        .prepare(
          `update rate_limits set attempts = attempts + 1
           where key = ? and bucket = 'subscription_exchange'`,
        )
        .run(identity);
      return null;
    });
    const retryAfter = consume.immediate();
    if (retryAfter !== null) {
      throw new SubscriptionError('RATE_LIMITED', retryAfter);
    }
  }

  #clearExchangeRateLimit(identity: string): void {
    this.connection.sqlite
      .prepare(
        `delete from rate_limits
         where key = ? and bucket = 'subscription_exchange'`,
      )
      .run(identity);
  }
}
