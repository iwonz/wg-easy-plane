import { randomUUID } from 'node:crypto';
import {
  CreateManagedClientRequestSchema,
  ManagedClientSchema,
  PlacementAdvancedStateSchema,
  PlacementAdvancedValuesSchema,
  UpdateManagedClientRequestSchema,
  type AmbiguousCreateCandidate,
  type CreateManagedClientRequest,
  type ManagedClient,
  type PlacementAdvancedState,
  type PlacementAdvancedValues,
  type PlacementStatus,
  type UpdateManagedClientRequest,
} from '@wg-easy-plane/contracts';
import type { DatabaseConnection } from '@wg-easy-plane/database';
import {
  WgEasyClientSchema,
  WgEasyClientUpdateRequestSchema,
  type WgEasyClient,
  type WgEasyClientUpdateRequest,
} from '@wg-easy-plane/wg-easy-adapter';

import type { InventorySyncService } from './sync';
import {
  NodeMutationError,
  type NodeMutationErrorCode,
  type NodeService,
} from './service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ManagedClientRow = {
  id: string;
  name: string;
  expires_at: number | null;
  enabled: number;
  lifecycle_status: 'active' | 'deleting';
  created_at: number;
  updated_at: number;
};

type PlacementRow = {
  id: string;
  managed_client_id: string;
  node_id: string;
  node_name: string;
  node_mode: string | null;
  remote_client_id: number | null;
  desired_payload: string | null;
  status: PlacementStatus;
  last_error_code: string | null;
  last_attempt_at: number | null;
  created_at: number;
  updated_at: number;
};

type ManagedCursor = { createdAt: number; id: string };
type AttemptOperation = 'create' | 'update' | 'enable' | 'disable' | 'delete';
type DesiredState =
  | { kind: 'shared'; name: string; expiresAt: string | null; enabled: boolean }
  | { kind: 'complete'; payload: WgEasyClientUpdateRequest };

type RemoteGateway = Pick<
  NodeService,
  | 'createRemoteClient'
  | 'updateRemoteClient'
  | 'setRemoteClientEnabled'
  | 'deleteRemoteClient'
>;
type InventoryGateway = Pick<InventorySyncService, 'syncNode'>;

export type ManagedClientPage = {
  items: ManagedClient[];
  nextCursor: string | null;
};
export type ManagedClientMutationResult = {
  deleted: boolean;
  client: ManagedClient | null;
};

export type ManagedClientServiceErrorCode =
  'INVALID_INPUT' | 'INVALID_CURSOR' | 'NOT_FOUND' | 'CONFLICT';

export class ManagedClientServiceError extends Error {
  constructor(readonly code: ManagedClientServiceErrorCode) {
    super(
      code === 'NOT_FOUND'
        ? 'Managed client or placement does not exist'
        : code === 'CONFLICT'
          ? 'Managed client transition conflicts with its durable state'
          : 'Invalid managed client input',
    );
    this.name = 'ManagedClientServiceError';
  }
}

function encodeCursor(cursor: ManagedCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value: string): ManagedCursor {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 2 ||
      !Number.isSafeInteger((parsed as ManagedCursor).createdAt) ||
      !UUID_PATTERN.test((parsed as ManagedCursor).id)
    ) {
      throw new Error('invalid cursor');
    }
    return parsed as ManagedCursor;
  } catch {
    throw new ManagedClientServiceError('INVALID_CURSOR');
  }
}

function desiredShared(row: ManagedClientRow): DesiredState {
  return {
    kind: 'shared',
    name: row.name,
    expiresAt:
      row.expires_at === null ? null : new Date(row.expires_at).toISOString(),
    enabled: row.enabled === 1,
  };
}

function updatePayload(
  client: WgEasyClient,
  owner: ManagedClientRow,
): WgEasyClientUpdateRequest {
  return WgEasyClientUpdateRequestSchema.parse({
    name: owner.name,
    enabled: owner.enabled === 1,
    expiresAt:
      owner.expires_at === null
        ? null
        : new Date(owner.expires_at).toISOString(),
    ipv4Address: client.ipv4Address,
    ipv6Address: client.ipv6Address,
    preUp: client.preUp,
    postUp: client.postUp,
    preDown: client.preDown,
    postDown: client.postDown,
    allowedIps: client.allowedIps,
    serverAllowedIps: client.serverAllowedIps,
    firewallIps: client.firewallIps,
    mtu: client.mtu,
    jC: client.jC,
    jMin: client.jMin,
    jMax: client.jMax,
    i1: client.i1,
    i2: client.i2,
    i3: client.i3,
    i4: client.i4,
    i5: client.i5,
    persistentKeepalive: client.persistentKeepalive,
    serverEndpoint: client.serverEndpoint,
    dns: client.dns,
  });
}

function advancedValues(
  payload: WgEasyClientUpdateRequest,
): PlacementAdvancedValues {
  return PlacementAdvancedValuesSchema.parse({
    ipv4Address: payload.ipv4Address,
    ipv6Address: payload.ipv6Address,
    preUp: payload.preUp,
    postUp: payload.postUp,
    preDown: payload.preDown,
    postDown: payload.postDown,
    allowedIps: payload.allowedIps,
    serverAllowedIps: payload.serverAllowedIps,
    firewallIps: payload.firewallIps,
    mtu: payload.mtu,
    jC: payload.jC,
    jMin: payload.jMin,
    jMax: payload.jMax,
    i1: payload.i1,
    i2: payload.i2,
    i3: payload.i3,
    i4: payload.i4,
    i5: payload.i5,
    persistentKeepalive: payload.persistentKeepalive,
    serverEndpoint: payload.serverEndpoint,
    dns: payload.dns,
  });
}

function safeFailureCode(
  error: unknown,
): NodeMutationErrorCode | 'INTERNAL_ERROR' {
  return error instanceof NodeMutationError ? error.code : 'INTERNAL_ERROR';
}

function isConstraintFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('SQLITE_CONSTRAINT')
  );
}

export class ManagedClientService {
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(
    private readonly connection: DatabaseConnection,
    private readonly remote: RemoteGateway,
    private readonly inventory: InventoryGateway,
    options: { now?: () => Date; newId?: () => string } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? randomUUID;
  }

  list(input: { cursor?: string; limit: number }): ManagedClientPage {
    if (
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 200
    ) {
      throw new ManagedClientServiceError('INVALID_INPUT');
    }
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;
    const rows = (
      cursor
        ? this.connection.sqlite
            .prepare(
              `select * from managed_clients
             where created_at < ? or (created_at = ? and id < ?)
             order by created_at desc, id desc limit ?`,
            )
            .all(cursor.createdAt, cursor.createdAt, cursor.id, input.limit + 1)
        : this.connection.sqlite
            .prepare(
              `select * from managed_clients
             order by created_at desc, id desc limit ?`,
            )
            .all(input.limit + 1)
    ) as ManagedClientRow[];
    const visible = rows.slice(0, input.limit);
    const last = visible.at(-1);
    return {
      items: visible.map((row) => this.#fromRow(row)),
      nextCursor:
        rows.length > input.limit && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  get(clientId: string): ManagedClient {
    return this.#fromRow(this.#requireClient(clientId));
  }

  async create(input: CreateManagedClientRequest): Promise<ManagedClient> {
    const parsed = CreateManagedClientRequestSchema.safeParse(input);
    if (!parsed.success) throw new ManagedClientServiceError('INVALID_INPUT');
    this.#requireNodes(parsed.data.nodeIds);
    const id = this.newId();
    const now = this.now().getTime();
    const expiresAt = parsed.data.expiresAt
      ? new Date(parsed.data.expiresAt).getTime()
      : null;
    const placementIds: string[] = [];
    const insert = this.connection.sqlite.transaction(() => {
      this.connection.sqlite
        .prepare(
          `insert into managed_clients
           (id, name, expires_at, enabled, lifecycle_status, created_at, updated_at)
           values (?, ?, ?, 1, 'active', ?, ?)`,
        )
        .run(id, parsed.data.name, expiresAt, now, now);
      const owner = this.#requireClient(id);
      const payload = JSON.stringify(desiredShared(owner));
      for (const nodeId of parsed.data.nodeIds) {
        const placementId = this.newId();
        placementIds.push(placementId);
        this.connection.sqlite
          .prepare(
            `insert into placements
             (id, managed_client_id, node_id, remote_client_id, desired_payload,
              status, last_error_code, last_attempt_at, created_at, updated_at)
             values (?, ?, ?, null, ?, 'pending', null, null, ?, ?)`,
          )
          .run(placementId, id, nodeId, payload, now, now);
      }
    });
    try {
      insert();
    } catch (error) {
      if (isConstraintFailure(error))
        throw new ManagedClientServiceError('CONFLICT');
      throw error;
    }
    for (const placementId of placementIds)
      await this.#createPlacement(placementId);
    return this.get(id);
  }

  async update(
    clientId: string,
    input: UpdateManagedClientRequest,
  ): Promise<ManagedClient> {
    const parsed = UpdateManagedClientRequestSchema.safeParse(input);
    if (!parsed.success) throw new ManagedClientServiceError('INVALID_INPUT');
    const owner = this.#requireActiveClient(clientId);
    const name = parsed.data.name ?? owner.name;
    const expiresAt =
      parsed.data.expiresAt === undefined
        ? owner.expires_at
        : parsed.data.expiresAt === null
          ? null
          : new Date(parsed.data.expiresAt).getTime();
    const now = this.now().getTime();
    this.connection.sqlite
      .prepare(
        'update managed_clients set name = ?, expires_at = ?, updated_at = ? where id = ?',
      )
      .run(name, expiresAt, now, clientId);
    this.#refreshDesiredSharedFields(clientId);
    for (const placement of this.#placementRows(clientId)) {
      if (
        placement.remote_client_id !== null &&
        placement.status !== 'ambiguous'
      ) {
        await this.#applyCompleteUpdate(placement.id);
      }
    }
    return this.get(clientId);
  }

  async setEnabled(clientId: string, enabled: boolean): Promise<ManagedClient> {
    this.#requireActiveClient(clientId);
    const now = this.now().getTime();
    this.connection.sqlite
      .prepare(
        'update managed_clients set enabled = ?, updated_at = ? where id = ?',
      )
      .run(enabled ? 1 : 0, now, clientId);
    this.#refreshDesiredSharedFields(clientId);
    for (const placement of this.#placementRows(clientId)) {
      if (
        placement.remote_client_id === null ||
        placement.status === 'ambiguous'
      )
        continue;
      const attemptId = this.#startAttempt(
        placement.id,
        enabled ? 'enable' : 'disable',
      );
      try {
        await this.remote.setRemoteClientEnabled(
          placement.node_id,
          placement.remote_client_id,
          enabled,
        );
        this.#finishSuccess(placement.id, attemptId);
      } catch (error) {
        this.#finishFailure(placement.id, attemptId, safeFailureCode(error));
      }
    }
    return this.get(clientId);
  }

  async addPlacement(clientId: string, nodeId: string): Promise<ManagedClient> {
    const owner = this.#requireActiveClient(clientId);
    this.#requireNodes([nodeId]);
    const placementId = this.newId();
    const now = this.now().getTime();
    try {
      this.connection.sqlite
        .prepare(
          `insert into placements
           (id, managed_client_id, node_id, remote_client_id, desired_payload,
            status, last_error_code, last_attempt_at, created_at, updated_at)
           values (?, ?, ?, null, ?, 'pending', null, null, ?, ?)`,
        )
        .run(
          placementId,
          clientId,
          nodeId,
          JSON.stringify(desiredShared(owner)),
          now,
          now,
        );
    } catch (error) {
      if (isConstraintFailure(error))
        throw new ManagedClientServiceError('CONFLICT');
      throw error;
    }
    await this.#createPlacement(placementId);
    return this.get(clientId);
  }

  async removePlacement(
    clientId: string,
    placementId: string,
  ): Promise<ManagedClientMutationResult> {
    this.#requireClient(clientId);
    const placement = this.#requirePlacement(clientId, placementId);
    if (
      placement.status === 'ambiguous' &&
      placement.remote_client_id === null
    ) {
      throw new ManagedClientServiceError('CONFLICT');
    }
    this.connection.sqlite
      .prepare(
        "update placements set status = 'deleting', updated_at = ? where id = ?",
      )
      .run(this.now().getTime(), placementId);
    await this.#deletePlacement(placementId);
    return this.#result(clientId);
  }

  async delete(clientId: string): Promise<ManagedClientMutationResult> {
    this.#requireClient(clientId);
    const now = this.now().getTime();
    this.connection.sqlite
      .prepare(
        "update managed_clients set lifecycle_status = 'deleting', updated_at = ? where id = ?",
      )
      .run(now, clientId);
    this.connection.sqlite
      .prepare(
        "update placements set status = 'deleting', updated_at = ? where managed_client_id = ? and status <> 'ambiguous'",
      )
      .run(now, clientId);
    for (const placement of this.#placementRows(clientId)) {
      if (placement.status !== 'ambiguous')
        await this.#deletePlacement(placement.id);
    }
    return this.#result(clientId);
  }

  async retry(
    clientId: string,
    placementId: string,
  ): Promise<ManagedClientMutationResult> {
    const owner = this.#requireClient(clientId);
    const placement = this.#requirePlacement(clientId, placementId);
    if (placement.status === 'ambiguous')
      throw new ManagedClientServiceError('CONFLICT');
    if (
      owner.lifecycle_status === 'deleting' ||
      placement.status === 'deleting'
    ) {
      await this.#deletePlacement(placementId);
    } else if (placement.remote_client_id === null) {
      await this.#createPlacement(placementId);
    } else {
      await this.#applyCompleteUpdate(placementId);
    }
    return this.#result(clientId);
  }

  async getAdvanced(
    clientId: string,
    placementId: string,
  ): Promise<PlacementAdvancedState> {
    this.#requireActiveClient(clientId);
    const placement = this.#requirePlacement(clientId, placementId);
    if (
      placement.remote_client_id === null ||
      placement.status === 'ambiguous' ||
      placement.status === 'deleting' ||
      placement.status === 'missing'
    ) {
      throw new ManagedClientServiceError('CONFLICT');
    }
    const payload = await this.#ensureCompletePayload(placement);
    if (!payload) throw new ManagedClientServiceError('CONFLICT');
    return this.#advancedState(
      clientId,
      this.#requirePlacement(clientId, placementId),
      payload,
    );
  }

  async updateAdvanced(
    clientId: string,
    placementId: string,
    input: PlacementAdvancedValues,
  ): Promise<PlacementAdvancedState> {
    const owner = this.#requireActiveClient(clientId);
    const placement = this.#requirePlacement(clientId, placementId);
    const parsed = PlacementAdvancedValuesSchema.safeParse(input);
    if (
      placement.remote_client_id === null ||
      placement.status === 'ambiguous' ||
      placement.status === 'deleting' ||
      placement.status === 'missing'
    ) {
      throw new ManagedClientServiceError('CONFLICT');
    }
    if (
      !parsed.success ||
      (placement.node_mode !== 'wireguard' && placement.node_mode !== 'amnezia')
    ) {
      throw new ManagedClientServiceError('INVALID_INPUT');
    }
    if (
      placement.node_mode === 'wireguard' &&
      [
        parsed.data.jC,
        parsed.data.jMin,
        parsed.data.jMax,
        parsed.data.i1,
        parsed.data.i2,
        parsed.data.i3,
        parsed.data.i4,
        parsed.data.i5,
      ].some((value) => value !== null)
    ) {
      throw new ManagedClientServiceError('INVALID_INPUT');
    }
    const complete = WgEasyClientUpdateRequestSchema.safeParse({
      name: owner.name,
      enabled: owner.enabled === 1,
      expiresAt:
        owner.expires_at === null
          ? null
          : new Date(owner.expires_at).toISOString(),
      ...parsed.data,
    });
    if (!complete.success) throw new ManagedClientServiceError('INVALID_INPUT');
    this.connection.sqlite
      .prepare(
        'update placements set desired_payload = ?, updated_at = ? where id = ?',
      )
      .run(
        JSON.stringify({ kind: 'complete', payload: complete.data }),
        this.now().getTime(),
        placementId,
      );
    await this.#applyCompleteUpdate(placementId);
    const current = this.#requirePlacement(clientId, placementId);
    const desired = this.#parseDesired(current.desired_payload);
    if (desired.kind !== 'complete')
      throw new ManagedClientServiceError('CONFLICT');
    return this.#advancedState(clientId, current, desired.payload);
  }

  listAmbiguousCandidates(
    clientId: string,
    placementId: string,
  ): AmbiguousCreateCandidate[] {
    const owner = this.#requireClient(clientId);
    const placement = this.#requirePlacement(clientId, placementId);
    if (placement.status !== 'ambiguous')
      throw new ManagedClientServiceError('CONFLICT');
    const rows = this.connection.sqlite
      .prepare(
        `select r.node_id, r.remote_client_id, r.public_data, r.last_seen_at
         from remote_clients r
         left join placements p
           on p.node_id = r.node_id and p.remote_client_id = r.remote_client_id
         where r.node_id = ? and r.name = ? and r.missing_at is null and p.id is null
         order by r.last_seen_at desc, r.remote_client_id desc`,
      )
      .all(placement.node_id, owner.name) as Array<{
      node_id: string;
      remote_client_id: number;
      public_data: string;
      last_seen_at: number;
    }>;
    return rows.map((row) => {
      const client = WgEasyClientSchema.parse(JSON.parse(row.public_data));
      return {
        nodeId: row.node_id,
        remoteClientId: row.remote_client_id,
        name: client.name,
        enabled: client.enabled,
        expiresAt: client.expiresAt,
        lastSeenAt: new Date(row.last_seen_at).toISOString(),
      };
    });
  }

  async linkCandidate(
    clientId: string,
    placementId: string,
    remoteClientId: number,
  ): Promise<ManagedClient> {
    const owner = this.#requireActiveClient(clientId);
    const placement = this.#requirePlacement(clientId, placementId);
    if (
      placement.status !== 'ambiguous' ||
      !Number.isInteger(remoteClientId) ||
      remoteClientId < 1
    ) {
      throw new ManagedClientServiceError('CONFLICT');
    }
    const candidate = this.listAmbiguousCandidates(clientId, placementId).find(
      (item) => item.remoteClientId === remoteClientId,
    );
    if (!candidate) throw new ManagedClientServiceError('NOT_FOUND');
    const now = this.now().getTime();
    const payload = this.#payloadFromSnapshot(
      placement.node_id,
      remoteClientId,
      owner,
    );
    try {
      this.connection.sqlite
        .prepare(
          `update placements set remote_client_id = ?, desired_payload = ?, status = 'active',
             last_error_code = null, updated_at = ? where id = ?`,
        )
        .run(
          remoteClientId,
          JSON.stringify({ kind: 'complete', payload }),
          now,
          placementId,
        );
    } catch (error) {
      if (isConstraintFailure(error))
        throw new ManagedClientServiceError('CONFLICT');
      throw error;
    }
    return this.get(clientId);
  }

  cancelAmbiguous(
    clientId: string,
    placementId: string,
  ): ManagedClientMutationResult {
    const owner = this.#requireClient(clientId);
    const placement = this.#requirePlacement(clientId, placementId);
    if (
      placement.status !== 'ambiguous' ||
      placement.remote_client_id !== null
    ) {
      throw new ManagedClientServiceError('CONFLICT');
    }
    this.connection.sqlite
      .prepare('delete from placements where id = ?')
      .run(placementId);
    if (owner.lifecycle_status === 'deleting')
      this.#cleanupDeletedClient(clientId);
    return this.#result(clientId);
  }

  async #createPlacement(placementId: string): Promise<void> {
    const placement = this.#requirePlacementById(placementId);
    const owner = this.#requireClient(placement.managed_client_id);
    const attemptId = this.#startAttempt(placementId, 'create');
    try {
      const remoteClientId = await this.remote.createRemoteClient(
        placement.node_id,
        {
          name: owner.name,
          expiresAt:
            owner.expires_at === null
              ? null
              : new Date(owner.expires_at).toISOString(),
        },
      );
      const now = this.now().getTime();
      this.connection.sqlite
        .prepare(
          `update placements set remote_client_id = ?, status = 'active',
             last_error_code = null, last_attempt_at = ?, updated_at = ? where id = ?`,
        )
        .run(remoteClientId, now, now, placementId);
      this.#finishAttempt(attemptId, 'succeeded', null);
      await this.#syncAndHydrate(placementId);
    } catch (error) {
      const code = safeFailureCode(error);
      const status = code === 'TIMEOUT' ? 'ambiguous' : 'error';
      this.#finishFailure(placementId, attemptId, code, status);
      if (status === 'ambiguous') {
        try {
          await this.inventory.syncNode(placement.node_id);
        } catch {
          // A safe sync-run record already captures this best-effort recovery failure.
        }
      }
    }
  }

  async #applyCompleteUpdate(placementId: string): Promise<void> {
    let placement = this.#requirePlacementById(placementId);
    if (placement.remote_client_id === null)
      throw new ManagedClientServiceError('CONFLICT');
    const payload = await this.#ensureCompletePayload(placement);
    if (!payload) return;
    placement = this.#requirePlacementById(placementId);
    const attemptId = this.#startAttempt(placementId, 'update');
    try {
      await this.remote.updateRemoteClient(
        placement.node_id,
        placement.remote_client_id as number,
        payload,
      );
      this.#finishSuccess(placementId, attemptId);
      await this.#syncAndHydrate(placementId);
    } catch (error) {
      this.#finishFailure(placementId, attemptId, safeFailureCode(error));
    }
  }

  async #deletePlacement(placementId: string): Promise<void> {
    const placement = this.#requirePlacementById(placementId);
    if (placement.remote_client_id === null) {
      this.connection.sqlite
        .prepare('delete from placements where id = ?')
        .run(placementId);
      this.#cleanupDeletedClient(placement.managed_client_id);
      return;
    }
    const attemptId = this.#startAttempt(placementId, 'delete');
    try {
      await this.remote.deleteRemoteClient(
        placement.node_id,
        placement.remote_client_id,
      );
      this.#finishAttempt(attemptId, 'succeeded', null);
      this.connection.sqlite
        .prepare('delete from placements where id = ?')
        .run(placementId);
      this.#cleanupDeletedClient(placement.managed_client_id);
    } catch (error) {
      this.#finishFailure(
        placementId,
        attemptId,
        safeFailureCode(error),
        'deleting',
      );
    }
  }

  async #ensureCompletePayload(
    placement: PlacementRow,
  ): Promise<WgEasyClientUpdateRequest | null> {
    const parsed = this.#parseDesired(placement.desired_payload);
    if (parsed.kind === 'complete') return parsed.payload;
    const hydration = await this.#syncAndHydrate(placement.id);
    const current = this.#requirePlacementById(placement.id);
    const hydrated = this.#parseDesired(current.desired_payload);
    if (hydrated.kind === 'complete') return hydrated.payload;
    const now = this.now().getTime();
    this.connection.sqlite
      .prepare(
        `update placements set status = ?, last_error_code = ?,
           last_attempt_at = ?, updated_at = ? where id = ?`,
      )
      .run(
        hydration === 'missing' ? 'missing' : 'error',
        hydration === 'missing' ? 'SNAPSHOT_MISSING' : 'SNAPSHOT_UNAVAILABLE',
        now,
        now,
        placement.id,
      );
    return null;
  }

  async #syncAndHydrate(
    placementId: string,
  ): Promise<'hydrated' | 'missing' | 'unavailable'> {
    const placement = this.#requirePlacementById(placementId);
    if (placement.remote_client_id === null) return 'unavailable';
    try {
      await this.inventory.syncNode(placement.node_id);
    } catch {
      return 'unavailable';
    }
    const owner = this.#requireClient(placement.managed_client_id);
    try {
      const payload = this.#payloadFromSnapshot(
        placement.node_id,
        placement.remote_client_id,
        owner,
      );
      this.connection.sqlite
        .prepare(
          'update placements set desired_payload = ?, updated_at = ? where id = ?',
        )
        .run(
          JSON.stringify({ kind: 'complete', payload }),
          this.now().getTime(),
          placementId,
        );
      return 'hydrated';
    } catch (error) {
      return error instanceof ManagedClientServiceError &&
        error.code === 'NOT_FOUND'
        ? 'missing'
        : 'unavailable';
    }
  }

  #advancedState(
    clientId: string,
    placement: PlacementRow,
    payload: WgEasyClientUpdateRequest,
  ): PlacementAdvancedState {
    if (
      placement.node_mode !== 'wireguard' &&
      placement.node_mode !== 'amnezia'
    ) {
      throw new ManagedClientServiceError('CONFLICT');
    }
    return PlacementAdvancedStateSchema.parse({
      clientId,
      placementId: placement.id,
      nodeId: placement.node_id,
      nodeName: placement.node_name,
      nodeMode: placement.node_mode,
      status: placement.status,
      supportedAwgGeneration:
        placement.node_mode === 'amnezia' ? 'legacy' : null,
      values: advancedValues(payload),
    });
  }

  #payloadFromSnapshot(
    nodeId: string,
    remoteClientId: number,
    owner: ManagedClientRow,
  ): WgEasyClientUpdateRequest {
    const row = this.connection.sqlite
      .prepare(
        `select public_data from remote_clients
         where node_id = ? and remote_client_id = ? and missing_at is null`,
      )
      .get(nodeId, remoteClientId) as { public_data: string } | undefined;
    if (!row) throw new ManagedClientServiceError('NOT_FOUND');
    return updatePayload(
      WgEasyClientSchema.parse(JSON.parse(row.public_data)),
      owner,
    );
  }

  #refreshDesiredSharedFields(clientId: string): void {
    const owner = this.#requireClient(clientId);
    const now = this.now().getTime();
    for (const placement of this.#placementRows(clientId)) {
      const desired = this.#parseDesired(placement.desired_payload);
      const next: DesiredState =
        desired.kind === 'complete'
          ? {
              kind: 'complete',
              payload: {
                ...desired.payload,
                name: owner.name,
                expiresAt:
                  owner.expires_at === null
                    ? null
                    : new Date(owner.expires_at).toISOString(),
                enabled: owner.enabled === 1,
              },
            }
          : desiredShared(owner);
      this.connection.sqlite
        .prepare(
          'update placements set desired_payload = ?, updated_at = ? where id = ?',
        )
        .run(JSON.stringify(next), now, placement.id);
    }
  }

  #parseDesired(value: string | null): DesiredState {
    if (!value) throw new Error('Managed placement has no desired state');
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || !('kind' in parsed)) {
      throw new Error('Managed placement desired state is invalid');
    }
    if ((parsed as { kind: unknown }).kind === 'complete') {
      if (!('payload' in parsed)) {
        throw new Error('Managed placement desired state is invalid');
      }
      return {
        kind: 'complete',
        payload: WgEasyClientUpdateRequestSchema.parse(parsed.payload),
      };
    }
    const shared = parsed as Partial<Extract<DesiredState, { kind: 'shared' }>>;
    if (
      shared.kind !== 'shared' ||
      typeof shared.name !== 'string' ||
      typeof shared.enabled !== 'boolean' ||
      (shared.expiresAt !== null && typeof shared.expiresAt !== 'string')
    ) {
      throw new Error('Managed placement desired state is invalid');
    }
    return {
      kind: 'shared',
      name: shared.name,
      expiresAt: shared.expiresAt,
      enabled: shared.enabled,
    };
  }

  #startAttempt(placementId: string, operation: AttemptOperation): string {
    const id = this.newId();
    const now = this.now().getTime();
    this.connection.sqlite
      .prepare(
        `insert into operation_attempts
         (id, placement_id, operation, status, error_code, started_at, finished_at)
         values (?, ?, ?, 'running', null, ?, null)`,
      )
      .run(id, placementId, operation, now);
    this.connection.sqlite
      .prepare(
        'update placements set last_attempt_at = ?, updated_at = ? where id = ?',
      )
      .run(now, now, placementId);
    return id;
  }

  #finishSuccess(placementId: string, attemptId: string): void {
    const now = this.now().getTime();
    this.#finishAttempt(attemptId, 'succeeded', null);
    this.connection.sqlite
      .prepare(
        `update placements set status = 'active', last_error_code = null,
           last_attempt_at = ?, updated_at = ? where id = ?`,
      )
      .run(now, now, placementId);
  }

  #finishFailure(
    placementId: string,
    attemptId: string,
    errorCode: string,
    status: PlacementStatus = 'error',
  ): void {
    const now = this.now().getTime();
    this.#finishAttempt(
      attemptId,
      status === 'ambiguous' ? 'ambiguous' : 'failed',
      errorCode,
    );
    this.connection.sqlite
      .prepare(
        `update placements set status = ?, last_error_code = ?,
           last_attempt_at = ?, updated_at = ? where id = ?`,
      )
      .run(status, errorCode, now, now, placementId);
  }

  #finishAttempt(
    attemptId: string,
    status: 'succeeded' | 'failed' | 'ambiguous',
    errorCode: string | null,
  ): void {
    this.connection.sqlite
      .prepare(
        `update operation_attempts set status = ?, error_code = ?, finished_at = ?
         where id = ?`,
      )
      .run(status, errorCode, this.now().getTime(), attemptId);
  }

  #cleanupDeletedClient(clientId: string): void {
    const owner = this.connection.sqlite
      .prepare('select lifecycle_status from managed_clients where id = ?')
      .get(clientId) as { lifecycle_status: string } | undefined;
    if (!owner || owner.lifecycle_status !== 'deleting') return;
    const remaining = this.connection.sqlite
      .prepare('select 1 from placements where managed_client_id = ? limit 1')
      .get(clientId);
    if (!remaining) {
      this.connection.sqlite
        .prepare('delete from managed_clients where id = ?')
        .run(clientId);
    }
  }

  #result(clientId: string): ManagedClientMutationResult {
    const row = this.connection.sqlite
      .prepare('select * from managed_clients where id = ?')
      .get(clientId) as ManagedClientRow | undefined;
    return row
      ? { deleted: false, client: this.#fromRow(row) }
      : { deleted: true, client: null };
  }

  #requireNodes(nodeIds: string[]): void {
    for (const nodeId of nodeIds) {
      if (!UUID_PATTERN.test(nodeId))
        throw new ManagedClientServiceError('INVALID_INPUT');
      const exists = this.connection.sqlite
        .prepare('select 1 from nodes where id = ? limit 1')
        .get(nodeId);
      if (!exists) throw new ManagedClientServiceError('NOT_FOUND');
    }
  }

  #requireActiveClient(clientId: string): ManagedClientRow {
    const row = this.#requireClient(clientId);
    if (row.lifecycle_status !== 'active')
      throw new ManagedClientServiceError('CONFLICT');
    return row;
  }

  #requireClient(clientId: string): ManagedClientRow {
    if (!UUID_PATTERN.test(clientId))
      throw new ManagedClientServiceError('INVALID_INPUT');
    const row = this.connection.sqlite
      .prepare('select * from managed_clients where id = ?')
      .get(clientId) as ManagedClientRow | undefined;
    if (!row) throw new ManagedClientServiceError('NOT_FOUND');
    return row;
  }

  #requirePlacement(clientId: string, placementId: string): PlacementRow {
    if (!UUID_PATTERN.test(placementId))
      throw new ManagedClientServiceError('INVALID_INPUT');
    const row = this.#requirePlacementById(placementId);
    if (row.managed_client_id !== clientId)
      throw new ManagedClientServiceError('NOT_FOUND');
    return row;
  }

  #requirePlacementById(placementId: string): PlacementRow {
    const row = this.connection.sqlite
      .prepare(
        `select p.*, n.name as node_name, n.mode as node_mode
         from placements p join nodes n on n.id = p.node_id where p.id = ?`,
      )
      .get(placementId) as PlacementRow | undefined;
    if (!row) throw new ManagedClientServiceError('NOT_FOUND');
    return row;
  }

  #placementRows(clientId: string): PlacementRow[] {
    return this.connection.sqlite
      .prepare(
        `select p.*, n.name as node_name, n.mode as node_mode
         from placements p join nodes n on n.id = p.node_id
         where p.managed_client_id = ? order by p.created_at, p.id`,
      )
      .all(clientId) as PlacementRow[];
  }

  #fromRow(row: ManagedClientRow): ManagedClient {
    return ManagedClientSchema.parse({
      id: row.id,
      name: row.name,
      expiresAt:
        row.expires_at === null ? null : new Date(row.expires_at).toISOString(),
      enabled: row.enabled === 1,
      lifecycleStatus: row.lifecycle_status,
      placements: this.#placementRows(row.id).map((placement) => ({
        id: placement.id,
        nodeId: placement.node_id,
        nodeName: placement.node_name,
        nodeMode:
          placement.node_mode === 'wireguard' ||
          placement.node_mode === 'amnezia'
            ? placement.node_mode
            : null,
        remoteClientId: placement.remote_client_id,
        status: placement.status,
        lastErrorCode: placement.last_error_code,
        desiredHydrated:
          this.#parseDesired(placement.desired_payload).kind === 'complete',
        lastAttemptAt:
          placement.last_attempt_at === null
            ? null
            : new Date(placement.last_attempt_at).toISOString(),
        createdAt: new Date(placement.created_at).toISOString(),
        updatedAt: new Date(placement.updated_at).toISOString(),
      })),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    });
  }
}
