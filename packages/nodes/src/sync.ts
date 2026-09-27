import { createHash, randomUUID } from 'node:crypto';
import {
  DiscoveredClientPublicDataSchema,
  DiscoveredClientSchema,
  SyncRunSummarySchema,
  type DiscoveredClient,
  type DiscoveredClientPublicData,
  type NodeMode,
  type NodeStatus,
  type SyncErrorCode,
  type SyncRunSummary,
} from '@wg-easy-plane/contracts';
import type { DatabaseConnection } from '@wg-easy-plane/database';
import {
  WgEasyClientSchema,
  type WgEasyClient,
} from '@wg-easy-plane/wg-easy-adapter';

import type { NodeInventoryFetchResult, NodeService } from './service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type InventorySource = Pick<NodeService, 'fetchInventory'>;

type DiscoveredCursor = {
  lastSeenAt: number;
  nodeId: string;
  remoteClientId: number;
};

type DiscoveredRow = {
  node_id: string;
  node_name: string;
  node_mode: string | null;
  node_status: string;
  remote_client_id: number;
  public_data: string;
  upstream_version: string;
  first_seen_at: number;
  last_seen_at: number;
  missing_at: number | null;
};

export type DiscoveredClientPage = {
  items: DiscoveredClient[];
  nextCursor: string | null;
};

export class InventorySyncError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'INVALID_CURSOR' | 'NOT_FOUND' | 'BUSY',
  ) {
    super(
      code === 'BUSY'
        ? 'Node synchronization is active'
        : code === 'NOT_FOUND'
          ? 'Node does not exist'
          : 'Invalid input',
    );
    this.name = 'InventorySyncError';
  }
}

function sortedJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedJsonValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, sortedJsonValue(entry)]),
    );
  }
  return value;
}

export function serializeSafeClient(client: WgEasyClient): {
  json: string;
  hash: string;
} {
  const safe = WgEasyClientSchema.parse(client);
  const json = JSON.stringify(sortedJsonValue(safe));
  return {
    json,
    hash: createHash('sha256').update(json, 'utf8').digest('hex'),
  };
}

function publicDataFromClient(
  client: WgEasyClient,
): DiscoveredClientPublicData {
  return DiscoveredClientPublicDataSchema.parse({
    name: client.name,
    enabled: client.enabled,
    expiresAt: client.expiresAt,
    ipv4Address: client.ipv4Address,
    ipv6Address: client.ipv6Address,
    latestHandshakeAt: client.latestHandshakeAt,
    transferRx: client.transferRx,
    transferTx: client.transferTx,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  });
}

function encodeCursor(cursor: DiscoveredCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value: string): DiscoveredCursor {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 3 ||
      !Number.isSafeInteger((parsed as DiscoveredCursor).lastSeenAt) ||
      !UUID_PATTERN.test((parsed as DiscoveredCursor).nodeId) ||
      !Number.isSafeInteger((parsed as DiscoveredCursor).remoteClientId) ||
      (parsed as DiscoveredCursor).remoteClientId < 1
    ) {
      throw new Error('invalid cursor');
    }
    return parsed as DiscoveredCursor;
  } catch {
    throw new InventorySyncError('INVALID_CURSOR');
  }
}

function modeFromRow(value: string | null): NodeMode | null {
  if (value === null || value === 'wireguard' || value === 'amnezia') {
    return value;
  }
  throw new Error('Stored node mode is invalid');
}

function statusFromRow(value: string): NodeStatus {
  if (
    value === 'healthy' ||
    value === 'unreachable' ||
    value === 'auth_failed' ||
    value === 'tls_error' ||
    value === 'unsupported_version' ||
    value === 'api_incompatible'
  ) {
    return value;
  }
  throw new Error('Stored node status is invalid');
}

function discoveredFromRow(row: DiscoveredRow): DiscoveredClient {
  if (row.upstream_version !== '15.4.0') {
    throw new Error('Stored upstream version is invalid');
  }
  const client = WgEasyClientSchema.parse(JSON.parse(row.public_data));
  return DiscoveredClientSchema.parse({
    nodeId: row.node_id,
    nodeName: row.node_name,
    nodeMode: modeFromRow(row.node_mode),
    nodeStatus: statusFromRow(row.node_status),
    remoteClientId: row.remote_client_id,
    publicData: publicDataFromClient(client),
    upstreamVersion: row.upstream_version,
    firstSeenAt: new Date(row.first_seen_at).toISOString(),
    lastSeenAt: new Date(row.last_seen_at).toISOString(),
    missingAt:
      row.missing_at === null ? null : new Date(row.missing_at).toISOString(),
  });
}

export class InventorySyncService {
  private readonly inFlight = new Set<string>();
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(
    private readonly connection: DatabaseConnection,
    private readonly source: InventorySource,
    options: { now?: () => Date; newId?: () => string } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? randomUUID;
  }

  async syncNode(nodeId: string): Promise<SyncRunSummary> {
    if (!UUID_PATTERN.test(nodeId))
      throw new InventorySyncError('INVALID_INPUT');
    if (this.inFlight.has(nodeId)) throw new InventorySyncError('BUSY');
    const nodeExists = this.connection.sqlite
      .prepare('select 1 from nodes where id = ? limit 1')
      .get(nodeId);
    if (!nodeExists) throw new InventorySyncError('NOT_FOUND');
    this.inFlight.add(nodeId);

    const runId = this.newId();
    const startedAt = this.now().getTime();
    try {
      this.connection.sqlite
        .prepare(
          `update sync_runs set status = 'failed', error_code = 'INTERRUPTED',
             finished_at = ? where node_id = ? and status = 'running'`,
        )
        .run(startedAt, nodeId);
      this.connection.sqlite
        .prepare(
          `insert into sync_runs (id, node_id, status, error_code, started_at, finished_at)
           values (?, ?, 'running', null, ?, null)`,
        )
        .run(runId, nodeId, startedAt);

      let result: NodeInventoryFetchResult;
      try {
        result = await this.source.fetchInventory(nodeId);
      } catch (error) {
        this.#finishFailure(runId, 'INTERNAL_ERROR');
        throw error;
      }

      if (!result.ok) {
        return this.#finishFailure(runId, result.errorCode);
      }
      try {
        return this.#reconcile(runId, nodeId, startedAt, result);
      } catch (error) {
        this.#finishFailure(runId, 'INTERNAL_ERROR');
        throw error;
      }
    } finally {
      this.inFlight.delete(nodeId);
    }
  }

  listDiscovered(input: {
    cursor?: string;
    limit: number;
  }): DiscoveredClientPage {
    if (
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 200
    ) {
      throw new InventorySyncError('INVALID_INPUT');
    }
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;
    const select = `select r.node_id, n.name as node_name, n.mode as node_mode,
       n.status as node_status,
       r.remote_client_id, r.public_data, r.upstream_version, r.first_seen_at,
       r.last_seen_at, r.missing_at
       from remote_clients r join nodes n on n.id = r.node_id
       left join placements p
         on p.node_id = r.node_id and p.remote_client_id = r.remote_client_id`;
    const order =
      'order by r.last_seen_at desc, r.node_id desc, r.remote_client_id desc limit ?';
    const rows = (
      cursor
        ? this.connection.sqlite
            .prepare(
              `${select}
               where p.id is null and (
                    r.last_seen_at < ?
                 or (r.last_seen_at = ? and r.node_id < ?)
                 or (r.last_seen_at = ? and r.node_id = ? and r.remote_client_id < ?)
               )
               ${order}`,
            )
            .all(
              cursor.lastSeenAt,
              cursor.lastSeenAt,
              cursor.nodeId,
              cursor.lastSeenAt,
              cursor.nodeId,
              cursor.remoteClientId,
              input.limit + 1,
            )
        : this.connection.sqlite
            .prepare(`${select} where p.id is null ${order}`)
            .all(input.limit + 1)
    ) as DiscoveredRow[];
    const visible = rows.slice(0, input.limit);
    const last = visible.at(-1);
    return {
      items: visible.map(discoveredFromRow),
      nextCursor:
        rows.length > input.limit && last
          ? encodeCursor({
              lastSeenAt: last.last_seen_at,
              nodeId: last.node_id,
              remoteClientId: last.remote_client_id,
            })
          : null,
    };
  }

  #finishFailure(runId: string, errorCode: SyncErrorCode): SyncRunSummary {
    const finishedAt = this.now().getTime();
    const row = this.connection.sqlite
      .prepare(
        `update sync_runs set status = 'failed', error_code = ?, finished_at = ?
         where id = ? returning node_id, started_at`,
      )
      .get(errorCode, finishedAt, runId) as
      { node_id: string; started_at: number } | undefined;
    if (!row) throw new Error('Synchronization run does not exist');
    return SyncRunSummarySchema.parse({
      id: runId,
      nodeId: row.node_id,
      status: 'failed',
      seenCount: 0,
      missingCount: 0,
      errorCode,
      startedAt: new Date(row.started_at).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
    });
  }

  #reconcile(
    runId: string,
    nodeId: string,
    startedAt: number,
    result: Extract<NodeInventoryFetchResult, { ok: true }>,
  ): SyncRunSummary {
    const finishedAt = this.now().getTime();
    const reconcile = this.connection.sqlite.transaction(() => {
      this.connection.sqlite
        .prepare(
          `update remote_clients set missing_at = coalesce(missing_at, ?)
           where node_id = ?`,
        )
        .run(finishedAt, nodeId);
      const upsert = this.connection.sqlite.prepare(
        `insert into remote_clients
         (node_id, remote_client_id, name, public_data, snapshot_hash,
          upstream_version, first_seen_at, last_seen_at, missing_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, null)
         on conflict(node_id, remote_client_id) do update set
           name = excluded.name,
           public_data = excluded.public_data,
           snapshot_hash = excluded.snapshot_hash,
           upstream_version = excluded.upstream_version,
           last_seen_at = excluded.last_seen_at,
           missing_at = null`,
      );
      for (const candidate of result.clients) {
        const client = WgEasyClientSchema.parse(candidate);
        const serialized = serializeSafeClient(client);
        upsert.run(
          nodeId,
          client.id,
          client.name,
          serialized.json,
          serialized.hash,
          result.upstreamVersion,
          finishedAt,
          finishedAt,
        );
      }
      this.connection.sqlite
        .prepare(
          `update nodes set last_synced_at = ?, updated_at = ? where id = ?`,
        )
        .run(finishedAt, finishedAt, nodeId);
      this.connection.sqlite
        .prepare(
          `update sync_runs set status = 'succeeded', error_code = null,
             finished_at = ? where id = ?`,
        )
        .run(finishedAt, runId);
      const missing = this.connection.sqlite
        .prepare(
          `select count(*) as count from remote_clients
           where node_id = ? and missing_at is not null`,
        )
        .get(nodeId) as { count: number };
      return missing.count;
    });

    const missingCount = reconcile();
    return SyncRunSummarySchema.parse({
      id: runId,
      nodeId,
      status: 'succeeded',
      seenCount: result.clients.length,
      missingCount,
      errorCode: null,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
    });
  }
}

export class SyncLease {
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly now: () => Date = () => new Date(),
  ) {}

  acquire(name: string, holderId: string, ttlMs: number): boolean {
    if (!name || !holderId || !Number.isSafeInteger(ttlMs) || ttlMs < 1) {
      throw new InventorySyncError('INVALID_INPUT');
    }
    const now = this.now().getTime();
    const result = this.connection.sqlite
      .prepare(
        `insert into sync_leases (name, holder_id, expires_at)
         values (?, ?, ?)
         on conflict(name) do update set
           holder_id = excluded.holder_id,
           expires_at = excluded.expires_at
         where sync_leases.expires_at <= ? or sync_leases.holder_id = ?`,
      )
      .run(name, holderId, now + ttlMs, now, holderId);
    return result.changes === 1;
  }

  refresh(name: string, holderId: string, ttlMs: number): boolean {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) {
      throw new InventorySyncError('INVALID_INPUT');
    }
    const result = this.connection.sqlite
      .prepare(
        `update sync_leases set expires_at = ?
         where name = ? and holder_id = ?`,
      )
      .run(this.now().getTime() + ttlMs, name, holderId);
    return result.changes === 1;
  }

  release(name: string, holderId: string): void {
    this.connection.sqlite
      .prepare('delete from sync_leases where name = ? and holder_id = ?')
      .run(name, holderId);
  }
}

type IntervalHandle = ReturnType<typeof setInterval> & { unref?: () => void };

export class InventorySyncScheduler {
  private readonly holderId: string;
  private readonly lease: SyncLease;
  private readonly setIntervalFn: (
    callback: () => void,
    intervalMs: number,
  ) => IntervalHandle;
  private timer: IntervalHandle | null = null;
  private cycleActive = false;

  constructor(
    private readonly connection: DatabaseConnection,
    private readonly syncService: Pick<InventorySyncService, 'syncNode'>,
    private readonly options: {
      intervalSeconds: number;
      requestTimeoutMs: number;
      holderId?: string;
      now?: () => Date;
      setIntervalFn?: (
        callback: () => void,
        intervalMs: number,
      ) => IntervalHandle;
      clearIntervalFn?: (handle: IntervalHandle) => void;
    },
  ) {
    this.holderId = options.holderId ?? randomUUID();
    this.lease = new SyncLease(connection, options.now);
    this.setIntervalFn = options.setIntervalFn ?? setInterval;
  }

  start(): void {
    if (this.options.intervalSeconds === 0 || this.timer) return;
    if (
      !Number.isSafeInteger(this.options.intervalSeconds) ||
      this.options.intervalSeconds < 0
    ) {
      throw new InventorySyncError('INVALID_INPUT');
    }
    this.timer = this.setIntervalFn(
      () => void this.runCycle(),
      this.options.intervalSeconds * 1_000,
    );
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    (this.options.clearIntervalFn ?? clearInterval)(this.timer);
    this.timer = null;
  }

  async runCycle(): Promise<boolean> {
    if (this.cycleActive) return false;
    this.cycleActive = true;
    const leaseName = 'client-inventory-scheduler';
    try {
      const nodeIds = (
        this.connection.sqlite
          .prepare('select id from nodes order by created_at asc, id asc')
          .all() as { id: string }[]
      ).map((row) => row.id);
      const ttlMs = Math.max(
        30_000,
        nodeIds.length * (this.options.requestTimeoutMs + 1_000) + 30_000,
      );
      if (!this.lease.acquire(leaseName, this.holderId, ttlMs)) return false;
      for (const nodeId of nodeIds) {
        if (!this.lease.refresh(leaseName, this.holderId, ttlMs)) return false;
        try {
          await this.syncService.syncNode(nodeId);
        } catch {
          // The run itself records sanitized failure state. Continue other nodes.
        }
      }
      return true;
    } finally {
      this.lease.release(leaseName, this.holderId);
      this.cycleActive = false;
    }
  }
}
