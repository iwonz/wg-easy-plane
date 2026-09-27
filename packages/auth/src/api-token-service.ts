import { randomBytes, randomUUID } from 'node:crypto';
import {
  API_TOKEN_SCOPES,
  type ApiTokenMetadata,
  type ApiTokenScope,
} from '@wg-easy-plane/contracts';
import type { DatabaseConnection } from '@wg-easy-plane/database';

import { deriveAuthKeys, keyedDigest } from './crypto';

const API_TOKEN_PATTERN = /^wgep_pat_[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const scopeSet = new Set<string>(API_TOKEN_SCOPES);

type ApiTokenErrorCode =
  'INVALID_INPUT' | 'INVALID_CURSOR' | 'UNAUTHORIZED' | 'NOT_FOUND';

export class ApiTokenError extends Error {
  constructor(
    readonly code: ApiTokenErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiTokenError';
  }
}

export type ApiTokenPrincipal = {
  kind: 'api-token';
  tokenId: string;
  scopes: ApiTokenScope[];
};

export type CreatedApiToken = {
  token: string;
  metadata: ApiTokenMetadata;
};

export type ApiTokenPage = {
  items: ApiTokenMetadata[];
  nextCursor: string | null;
};

type TokenRow = {
  id: string;
  name: string;
  token_prefix: string;
  token_hash: string;
  scopes: string;
  expires_at: number | null;
  last_used_at: number | null;
  revoked_at: number | null;
  created_at: number;
};

type Cursor = {
  createdAt: number;
  id: string;
};

function parseScopes(value: string): ApiTokenScope[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      new Set(parsed).size !== parsed.length ||
      !parsed.every((scope) => typeof scope === 'string' && scopeSet.has(scope))
    ) {
      return null;
    }
    return parsed as ApiTokenScope[];
  } catch {
    return null;
  }
}

function assertScopes(
  scopes: readonly string[],
): asserts scopes is ApiTokenScope[] {
  if (
    scopes.length === 0 ||
    scopes.length > API_TOKEN_SCOPES.length ||
    new Set(scopes).size !== scopes.length ||
    !scopes.every((scope) => scopeSet.has(scope))
  ) {
    throw new ApiTokenError('INVALID_INPUT', 'Invalid API token scopes');
  }
}

function metadataFromRow(row: TokenRow): ApiTokenMetadata {
  const scopes = parseScopes(row.scopes);
  if (!scopes) {
    throw new ApiTokenError('UNAUTHORIZED', 'API token is invalid');
  }
  return {
    id: row.id,
    name: row.name,
    prefix: row.token_prefix,
    scopes,
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt:
      row.expires_at === null ? null : new Date(row.expires_at).toISOString(),
    lastUsedAt:
      row.last_used_at === null
        ? null
        : new Date(row.last_used_at).toISOString(),
    revokedAt:
      row.revoked_at === null ? null : new Date(row.revoked_at).toISOString(),
  };
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value: string): Cursor {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 2 ||
      typeof (parsed as Cursor).createdAt !== 'number' ||
      !Number.isSafeInteger((parsed as Cursor).createdAt) ||
      !UUID_PATTERN.test((parsed as Cursor).id)
    ) {
      throw new Error('invalid cursor');
    }
    return parsed as Cursor;
  } catch {
    throw new ApiTokenError('INVALID_CURSOR', 'Invalid pagination cursor');
  }
}

export class ApiTokenService {
  private readonly tokenKey: Uint8Array;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly random: (size: number) => Uint8Array;

  constructor(
    private readonly connection: DatabaseConnection,
    options: {
      masterKey: Uint8Array;
      now?: () => Date;
      newId?: () => string;
      randomBytes?: (size: number) => Uint8Array;
    },
  ) {
    this.tokenKey = deriveAuthKeys(options.masterKey).apiToken;
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? randomUUID;
    this.random = options.randomBytes ?? randomBytes;
  }

  create(input: {
    name: string;
    scopes: ApiTokenScope[];
    expiresAt?: Date | null;
  }): CreatedApiToken {
    const name = input.name.trim();
    if (name.length === 0 || name.length > 80) {
      throw new ApiTokenError('INVALID_INPUT', 'Invalid API token name');
    }
    assertScopes(input.scopes);

    const now = this.now();
    const expiresAt = input.expiresAt ?? null;
    if (
      expiresAt !== null &&
      (!Number.isFinite(expiresAt.getTime()) ||
        expiresAt.getTime() <= now.getTime())
    ) {
      throw new ApiTokenError(
        'INVALID_INPUT',
        'Expiration must be in the future',
      );
    }

    const randomPart = Buffer.from(this.random(32)).toString('base64url');
    if (randomPart.length !== 43) {
      throw new Error(
        'API token randomness source must return exactly 32 bytes',
      );
    }
    const token = `wgep_pat_${randomPart}`;
    const row: TokenRow = {
      id: this.newId(),
      name,
      token_prefix: `wgep_pat_${randomPart.slice(0, 8)}`,
      token_hash: keyedDigest(this.tokenKey, token),
      scopes: JSON.stringify(input.scopes),
      expires_at: expiresAt?.getTime() ?? null,
      last_used_at: null,
      revoked_at: null,
      created_at: now.getTime(),
    };

    this.connection.sqlite
      .prepare(
        `insert into api_tokens
         (id, name, token_prefix, token_hash, scopes, expires_at, last_used_at, revoked_at, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.name,
        row.token_prefix,
        row.token_hash,
        row.scopes,
        row.expires_at,
        row.last_used_at,
        row.revoked_at,
        row.created_at,
      );

    return { token, metadata: metadataFromRow(row) };
  }

  authenticate(token: string): ApiTokenPrincipal {
    if (!API_TOKEN_PATTERN.test(token)) {
      throw new ApiTokenError('UNAUTHORIZED', 'API token is invalid');
    }

    const row = this.connection.sqlite
      .prepare(
        `select id, name, token_prefix, token_hash, scopes, expires_at,
                last_used_at, revoked_at, created_at
         from api_tokens where token_hash = ? limit 1`,
      )
      .get(keyedDigest(this.tokenKey, token)) as TokenRow | undefined;
    const nowMs = this.now().getTime();
    const scopes = row ? parseScopes(row.scopes) : null;
    if (
      !row ||
      !scopes ||
      row.revoked_at !== null ||
      (row.expires_at !== null && row.expires_at <= nowMs)
    ) {
      throw new ApiTokenError('UNAUTHORIZED', 'API token is invalid');
    }

    this.connection.sqlite
      .prepare('update api_tokens set last_used_at = ? where id = ?')
      .run(nowMs, row.id);
    return { kind: 'api-token', tokenId: row.id, scopes };
  }

  list(input: { cursor?: string; limit: number }): ApiTokenPage {
    if (
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 200
    ) {
      throw new ApiTokenError('INVALID_INPUT', 'Invalid pagination limit');
    }
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;
    const rows = (
      cursor
        ? this.connection.sqlite
            .prepare(
              `select id, name, token_prefix, token_hash, scopes, expires_at,
                    last_used_at, revoked_at, created_at
             from api_tokens
             where created_at < ? or (created_at = ? and id < ?)
             order by created_at desc, id desc limit ?`,
            )
            .all(cursor.createdAt, cursor.createdAt, cursor.id, input.limit + 1)
        : this.connection.sqlite
            .prepare(
              `select id, name, token_prefix, token_hash, scopes, expires_at,
                    last_used_at, revoked_at, created_at
             from api_tokens order by created_at desc, id desc limit ?`,
            )
            .all(input.limit + 1)
    ) as TokenRow[];
    const visible = rows.slice(0, input.limit);
    const last = visible.at(-1);

    return {
      items: visible.map(metadataFromRow),
      nextCursor:
        rows.length > input.limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  revoke(tokenId: string): void {
    const nowMs = this.now().getTime();
    const result = this.connection.sqlite
      .prepare(
        `update api_tokens set revoked_at = coalesce(revoked_at, ?)
         where id = ?`,
      )
      .run(nowMs, tokenId);
    if (result.changes === 0) {
      throw new ApiTokenError('NOT_FOUND', 'API token does not exist');
    }
  }
}
