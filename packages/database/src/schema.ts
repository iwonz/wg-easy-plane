import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
};

export const admins = sqliteTable('admins', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  ...timestamps,
});

export const refreshSessions = sqliteTable(
  'refresh_sessions',
  {
    id: text('id').primaryKey(),
    adminId: text('admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),
    familyId: text('family_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    rotatedAt: integer('rotated_at', { mode: 'timestamp_ms' }),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    index('refresh_sessions_admin_idx').on(table.adminId),
    index('refresh_sessions_family_idx').on(table.familyId),
  ],
);

export const apiTokens = sqliteTable(
  'api_tokens',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    scopes: text('scopes', { mode: 'json' }).$type<string[]>().notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    index('api_tokens_active_idx').on(table.revokedAt, table.expiresAt),
  ],
);

export const nodes = sqliteTable(
  'nodes',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    protocol: text('protocol', { enum: ['http', 'https'] }).notNull(),
    host: text('host').notNull(),
    port: integer('port').notNull(),
    usernameCiphertext: text('username_ciphertext').notNull(),
    passwordCiphertext: text('password_ciphertext').notNull(),
    allowInsecureTls: integer('allow_insecure_tls', { mode: 'boolean' })
      .notNull()
      .default(false),
    status: text('status', {
      enum: [
        'healthy',
        'unreachable',
        'auth_failed',
        'tls_error',
        'unsupported_version',
        'api_incompatible',
      ],
    })
      .notNull()
      .default('unreachable'),
    detectedVersion: text('detected_version'),
    mode: text('mode', { enum: ['wireguard', 'amnezia'] }),
    lastCheckedAt: integer('last_checked_at', { mode: 'timestamp_ms' }),
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }),
    lastErrorCode: text('last_error_code'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('nodes_endpoint_unique').on(
      table.protocol,
      table.host,
      table.port,
    ),
  ],
);

export const remoteClients = sqliteTable(
  'remote_clients',
  {
    nodeId: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    remoteClientId: integer('remote_client_id').notNull(),
    name: text('name').notNull(),
    publicData: text('public_data', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull(),
    snapshotHash: text('snapshot_hash').notNull(),
    upstreamVersion: text('upstream_version').notNull(),
    firstSeenAt: integer('first_seen_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
    missingAt: integer('missing_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    primaryKey({ columns: [table.nodeId, table.remoteClientId] }),
    index('remote_clients_name_idx').on(table.name),
    index('remote_clients_seen_idx').on(table.nodeId, table.lastSeenAt),
  ],
);

export const managedClients = sqliteTable(
  'managed_clients',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    lifecycleStatus: text('lifecycle_status', {
      enum: ['active', 'deleting'],
    })
      .notNull()
      .default('active'),
    ...timestamps,
  },
  (table) => [index('managed_clients_name_idx').on(table.name)],
);

export const placements = sqliteTable(
  'placements',
  {
    id: text('id').primaryKey(),
    managedClientId: text('managed_client_id')
      .notNull()
      .references(() => managedClients.id, { onDelete: 'cascade' }),
    nodeId: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'restrict' }),
    remoteClientId: integer('remote_client_id'),
    desiredPayload: text('desired_payload', { mode: 'json' }).$type<
      Record<string, unknown>
    >(),
    status: text('status', {
      enum: [
        'pending',
        'active',
        'error',
        'drift',
        'missing',
        'deleting',
        'ambiguous',
      ],
    })
      .notNull()
      .default('pending'),
    lastErrorCode: text('last_error_code'),
    lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp_ms' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('placements_managed_node_unique').on(
      table.managedClientId,
      table.nodeId,
    ),
    uniqueIndex('placements_remote_unique').on(
      table.nodeId,
      table.remoteClientId,
    ),
    index('placements_status_idx').on(table.status),
  ],
);

export const operationAttempts = sqliteTable(
  'operation_attempts',
  {
    id: text('id').primaryKey(),
    placementId: text('placement_id').references(() => placements.id, {
      onDelete: 'set null',
    }),
    operation: text('operation', {
      enum: ['create', 'update', 'enable', 'disable', 'delete', 'sync'],
    }).notNull(),
    status: text('status', {
      enum: ['running', 'succeeded', 'failed', 'ambiguous'],
    }).notNull(),
    errorCode: text('error_code'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
  },
  (table) => [index('operation_attempts_placement_idx').on(table.placementId)],
);

export const subscriptionTokens = sqliteTable('subscription_tokens', {
  id: text('id').primaryKey(),
  managedClientId: text('managed_client_id')
    .notNull()
    .unique()
    .references(() => managedClients.id, { onDelete: 'cascade' }),
  tokenPrefix: text('token_prefix').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  tokenCiphertext: text('token_ciphertext').notNull(),
  version: integer('version').notNull().default(1),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  rotatedAt: integer('rotated_at', { mode: 'timestamp_ms' }),
  createdAt: timestamps.createdAt,
});

export const syncRuns = sqliteTable(
  'sync_runs',
  {
    id: text('id').primaryKey(),
    nodeId: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    status: text('status', {
      enum: ['running', 'succeeded', 'failed'],
    }).notNull(),
    errorCode: text('error_code'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('sync_runs_node_started_idx').on(table.nodeId, table.startedAt),
  ],
);

export const syncLeases = sqliteTable('sync_leases', {
  name: text('name').primaryKey(),
  holderId: text('holder_id').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
});

export const rateLimits = sqliteTable(
  'rate_limits',
  {
    key: text('key').notNull(),
    bucket: text('bucket').notNull(),
    attempts: integer('attempts').notNull(),
    resetAt: integer('reset_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.key, table.bucket] }),
    index('rate_limits_reset_idx').on(table.resetAt),
  ],
);

export const adminRelations = relations(admins, ({ many }) => ({
  refreshSessions: many(refreshSessions),
}));

export const nodeRelations = relations(nodes, ({ many }) => ({
  remoteClients: many(remoteClients),
  placements: many(placements),
  syncRuns: many(syncRuns),
}));

export const managedClientRelations = relations(
  managedClients,
  ({ many, one }) => ({
    placements: many(placements),
    subscriptionToken: one(subscriptionTokens),
  }),
);

export const placementRelations = relations(placements, ({ one, many }) => ({
  managedClient: one(managedClients, {
    fields: [placements.managedClientId],
    references: [managedClients.id],
  }),
  node: one(nodes, {
    fields: [placements.nodeId],
    references: [nodes.id],
  }),
  attempts: many(operationAttempts),
}));
