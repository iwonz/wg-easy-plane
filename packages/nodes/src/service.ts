import { randomBytes, randomUUID } from 'node:crypto';
import {
  CreateNodeRequestSchema,
  NODE_ERROR_CODES,
  NODE_STATUSES,
  NodeMetadataSchema,
  TestNodeConnectionRequestSchema,
  UpdateNodeRequestSchema,
  type CreateNodeRequest,
  type NodeConnectionTestResult,
  type NodeErrorCode,
  type NodeMetadata,
  type NodeMode,
  type NodeProtocol,
  type NodeStatus,
  type TestNodeConnectionRequest,
  type UpdateNodeRequest,
} from '@wg-easy-plane/contracts';
import type { DatabaseConnection } from '@wg-easy-plane/database';
import {
  WgEasyAdapter,
  WgEasyAdapterError,
  type WgEasyClient,
  type WgEasyConnection,
  type WgEasyProbe,
} from '@wg-easy-plane/wg-easy-adapter';

import { NodeCredentialCipher } from './crypto';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const nodeStatusSet = new Set<string>(NODE_STATUSES);
const nodeErrorCodeSet = new Set<string>(NODE_ERROR_CODES);

type NodeServiceErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_CURSOR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'HAS_PLACEMENTS';

export class NodeServiceError extends Error {
  constructor(
    readonly code: NodeServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'NodeServiceError';
  }
}

type NodeRow = {
  id: string;
  name: string;
  protocol: NodeProtocol;
  host: string;
  port: number;
  username_ciphertext: string;
  password_ciphertext: string;
  allow_insecure_tls: number;
  status: string;
  detected_version: string | null;
  mode: string | null;
  last_checked_at: number | null;
  last_synced_at: number | null;
  last_error_code: string | null;
  created_at: number;
  updated_at: number;
};

type NodeCursor = { createdAt: number; id: string };

type ProbeState = {
  status: NodeStatus;
  detectedVersion: string | null;
  mode: NodeMode | null;
  lastErrorCode: NodeErrorCode | null;
  checkedAt: number;
};

type ProbeAdapter = { probe(): Promise<WgEasyProbe> };
export type NodeAdapterFactory = (connection: WgEasyConnection) => ProbeAdapter;

export type NodePage = {
  items: NodeMetadata[];
  nextCursor: string | null;
};

export type NodeInventoryFetchResult =
  | {
      ok: true;
      node: NodeMetadata;
      clients: WgEasyClient[];
      upstreamVersion: '15.4.0';
    }
  | {
      ok: false;
      node: NodeMetadata;
      errorCode: NodeErrorCode;
    };

function encodeCursor(cursor: NodeCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value: string): NodeCursor {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 2 ||
      typeof (parsed as NodeCursor).createdAt !== 'number' ||
      !Number.isSafeInteger((parsed as NodeCursor).createdAt) ||
      !UUID_PATTERN.test((parsed as NodeCursor).id)
    ) {
      throw new Error('invalid cursor');
    }
    return parsed as NodeCursor;
  } catch {
    throw new NodeServiceError('INVALID_CURSOR', 'Invalid node cursor');
  }
}

function metadataFromRow(row: NodeRow): NodeMetadata {
  if (
    !nodeStatusSet.has(row.status) ||
    (row.mode !== null && row.mode !== 'wireguard' && row.mode !== 'amnezia') ||
    (row.last_error_code !== null && !nodeErrorCodeSet.has(row.last_error_code))
  ) {
    throw new Error('Stored node metadata is invalid');
  }
  return NodeMetadataSchema.parse({
    id: row.id,
    name: row.name,
    protocol: row.protocol,
    host: row.host,
    port: row.port,
    allowInsecureTls: row.allow_insecure_tls === 1,
    status: row.status,
    detectedVersion: row.detected_version,
    mode: row.mode,
    lastErrorCode: row.last_error_code,
    lastCheckedAt:
      row.last_checked_at === null
        ? null
        : new Date(row.last_checked_at).toISOString(),
    lastSyncedAt:
      row.last_synced_at === null
        ? null
        : new Date(row.last_synced_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  });
}

function testResultFromProbe(probe: ProbeState): NodeConnectionTestResult {
  return {
    status: probe.status,
    detectedVersion: probe.detectedVersion,
    mode: probe.mode,
    lastErrorCode: probe.lastErrorCode,
    lastCheckedAt: new Date(probe.checkedAt).toISOString(),
  };
}

function mapAdapterFailure(
  error: WgEasyAdapterError,
  checkedAt: number,
  prior?: { detectedVersion: string | null; mode: NodeMode | null },
): ProbeState {
  const preserved = prior ?? { detectedVersion: null, mode: null };
  switch (error.code) {
    case 'AUTH_FAILED':
      return {
        status: 'auth_failed',
        detectedVersion: preserved.detectedVersion,
        mode: preserved.mode,
        lastErrorCode: error.code,
        checkedAt,
      };
    case 'TLS_ERROR':
      return {
        status: 'tls_error',
        detectedVersion: preserved.detectedVersion,
        mode: preserved.mode,
        lastErrorCode: error.code,
        checkedAt,
      };
    case 'UNSUPPORTED_VERSION':
      return {
        status: 'unsupported_version',
        detectedVersion: error.detectedVersion ?? preserved.detectedVersion,
        mode: preserved.mode,
        lastErrorCode: error.code,
        checkedAt,
      };
    case 'API_INCOMPATIBLE':
    case 'NOT_FOUND':
    case 'REDIRECT_BLOCKED':
    case 'RESPONSE_TOO_LARGE':
    case 'INVALID_REQUEST':
      return {
        status: 'api_incompatible',
        detectedVersion: preserved.detectedVersion,
        mode: preserved.mode,
        lastErrorCode:
          error.code === 'INVALID_REQUEST' ? 'API_INCOMPATIBLE' : error.code,
        checkedAt,
      };
    case 'TIMEOUT':
    case 'UNREACHABLE':
    case 'UPSTREAM_ERROR':
      return {
        status: 'unreachable',
        detectedVersion: preserved.detectedVersion,
        mode: preserved.mode,
        lastErrorCode: error.code,
        checkedAt,
      };
  }
}

function isConstraintFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('SQLITE_CONSTRAINT')
  );
}

export class NodeService {
  private readonly cipher: NodeCredentialCipher;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly adapterFactory: NodeAdapterFactory;
  private readonly requestTimeoutMs: number;

  constructor(
    private readonly connection: DatabaseConnection,
    options: {
      masterKey: Uint8Array;
      requestTimeoutMs?: number;
      now?: () => Date;
      newId?: () => string;
      randomBytes?: (size: number) => Uint8Array;
      adapterFactory?: NodeAdapterFactory;
    },
  ) {
    this.cipher = new NodeCredentialCipher(
      options.masterKey,
      options.randomBytes ?? randomBytes,
    );
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? randomUUID;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.adapterFactory =
      options.adapterFactory ?? ((connection) => new WgEasyAdapter(connection));
  }

  list(input: { cursor?: string; limit: number }): NodePage {
    if (
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 200
    ) {
      throw new NodeServiceError('INVALID_INPUT', 'Invalid node page size');
    }
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;
    const rows = (
      cursor
        ? this.connection.sqlite
            .prepare(
              `select * from nodes
               where created_at < ? or (created_at = ? and id < ?)
               order by created_at desc, id desc limit ?`,
            )
            .all(cursor.createdAt, cursor.createdAt, cursor.id, input.limit + 1)
        : this.connection.sqlite
            .prepare(
              `select * from nodes
               order by created_at desc, id desc limit ?`,
            )
            .all(input.limit + 1)
    ) as NodeRow[];
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

  get(nodeId: string): NodeMetadata {
    return metadataFromRow(this.#requireRow(nodeId));
  }

  async testConnection(
    input: TestNodeConnectionRequest,
  ): Promise<NodeConnectionTestResult> {
    const connection = this.#parseConnection(input);
    return testResultFromProbe(await this.#probe(connection));
  }

  async create(input: CreateNodeRequest): Promise<NodeMetadata> {
    const parsed = CreateNodeRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new NodeServiceError('INVALID_INPUT', 'Invalid node input');
    }
    this.#assertUnique(parsed.data.name, parsed.data, null);
    const id = this.newId();
    const probe = await this.#probe(parsed.data);
    const usernameCiphertext = this.cipher.encrypt(
      id,
      'username',
      parsed.data.username,
    );
    const passwordCiphertext = this.cipher.encrypt(
      id,
      'password',
      parsed.data.password,
    );

    try {
      this.connection.sqlite
        .prepare(
          `insert into nodes
           (id, name, protocol, host, port, username_ciphertext,
            password_ciphertext, allow_insecure_tls, status, detected_version,
            mode, last_checked_at, last_synced_at, last_error_code,
            created_at, updated_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, ?, ?)`,
        )
        .run(
          id,
          parsed.data.name,
          parsed.data.protocol,
          parsed.data.host,
          parsed.data.port,
          usernameCiphertext,
          passwordCiphertext,
          parsed.data.allowInsecureTls ? 1 : 0,
          probe.status,
          probe.detectedVersion,
          probe.mode,
          probe.checkedAt,
          probe.lastErrorCode,
          probe.checkedAt,
          probe.checkedAt,
        );
    } catch (error) {
      if (isConstraintFailure(error)) {
        throw new NodeServiceError('CONFLICT', 'Node already exists');
      }
      throw error;
    }
    return this.get(id);
  }

  async update(
    nodeId: string,
    input: UpdateNodeRequest,
  ): Promise<NodeMetadata> {
    const parsed = UpdateNodeRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new NodeServiceError('INVALID_INPUT', 'Invalid node input');
    }
    const row = this.#requireRow(nodeId);
    const connectionChanged = [
      'protocol',
      'host',
      'port',
      'username',
      'password',
      'allowInsecureTls',
    ].some((key) => Object.hasOwn(parsed.data, key));
    const name = parsed.data.name ?? row.name;

    let protocol = row.protocol;
    let host = row.host;
    let port = row.port;
    let allowInsecureTls = row.allow_insecure_tls === 1;
    let usernameCiphertext = row.username_ciphertext;
    let passwordCiphertext = row.password_ciphertext;
    let probe: ProbeState | null = null;

    if (connectionChanged) {
      const username =
        parsed.data.username ??
        this.cipher.decrypt(nodeId, 'username', row.username_ciphertext);
      const password =
        parsed.data.password ??
        this.cipher.decrypt(nodeId, 'password', row.password_ciphertext);
      const connection = this.#parseConnection({
        protocol: parsed.data.protocol ?? row.protocol,
        host: parsed.data.host ?? row.host,
        port: parsed.data.port ?? row.port,
        username,
        password,
        allowInsecureTls:
          parsed.data.allowInsecureTls ?? row.allow_insecure_tls === 1,
      });
      protocol = connection.protocol;
      host = connection.host;
      port = connection.port;
      allowInsecureTls = connection.allowInsecureTls;
      this.#assertUnique(name, connection, nodeId);
      probe = await this.#probe(connection, {
        detectedVersion: row.detected_version,
        mode:
          row.mode === 'wireguard' || row.mode === 'amnezia' ? row.mode : null,
      });
      usernameCiphertext = this.cipher.encrypt(nodeId, 'username', username);
      passwordCiphertext = this.cipher.encrypt(nodeId, 'password', password);
    } else {
      this.#assertUnique(name, row, nodeId);
    }

    const updatedAt = this.now().getTime();
    try {
      this.connection.sqlite
        .prepare(
          `update nodes set
             name = ?, protocol = ?, host = ?, port = ?,
             username_ciphertext = ?, password_ciphertext = ?,
             allow_insecure_tls = ?, status = ?, detected_version = ?,
             mode = ?, last_checked_at = ?, last_error_code = ?, updated_at = ?
           where id = ?`,
        )
        .run(
          name,
          protocol,
          host,
          port,
          usernameCiphertext,
          passwordCiphertext,
          allowInsecureTls ? 1 : 0,
          probe?.status ?? row.status,
          probe?.detectedVersion ?? row.detected_version,
          probe?.mode ?? row.mode,
          probe?.checkedAt ?? row.last_checked_at,
          probe ? probe.lastErrorCode : row.last_error_code,
          updatedAt,
          nodeId,
        );
    } catch (error) {
      if (isConstraintFailure(error)) {
        throw new NodeServiceError('CONFLICT', 'Node already exists');
      }
      throw error;
    }
    return this.get(nodeId);
  }

  async retest(nodeId: string): Promise<NodeMetadata> {
    const row = this.#requireRow(nodeId);
    const connection = this.#parseConnection({
      protocol: row.protocol,
      host: row.host,
      port: row.port,
      username: this.cipher.decrypt(
        nodeId,
        'username',
        row.username_ciphertext,
      ),
      password: this.cipher.decrypt(
        nodeId,
        'password',
        row.password_ciphertext,
      ),
      allowInsecureTls: row.allow_insecure_tls === 1,
    });
    const probe = await this.#probe(connection, {
      detectedVersion: row.detected_version,
      mode:
        row.mode === 'wireguard' || row.mode === 'amnezia' ? row.mode : null,
    });
    this.connection.sqlite
      .prepare(
        `update nodes set status = ?, detected_version = ?, mode = ?,
           last_checked_at = ?, last_error_code = ?, updated_at = ?
         where id = ?`,
      )
      .run(
        probe.status,
        probe.detectedVersion,
        probe.mode,
        probe.checkedAt,
        probe.lastErrorCode,
        probe.checkedAt,
        nodeId,
      );
    return this.get(nodeId);
  }

  async fetchInventory(nodeId: string): Promise<NodeInventoryFetchResult> {
    const row = this.#requireRow(nodeId);
    const connection = this.#parseConnection({
      protocol: row.protocol,
      host: row.host,
      port: row.port,
      username: this.cipher.decrypt(
        nodeId,
        'username',
        row.username_ciphertext,
      ),
      password: this.cipher.decrypt(
        nodeId,
        'password',
        row.password_ciphertext,
      ),
      allowInsecureTls: row.allow_insecure_tls === 1,
    });
    const adapterConnection: WgEasyConnection = {
      ...connection,
      timeoutMs: this.requestTimeoutMs,
    };
    let probe: WgEasyProbe;
    try {
      probe = await this.adapterFactory(adapterConnection).probe();
    } catch (error) {
      if (!(error instanceof WgEasyAdapterError)) throw error;
      const state = mapAdapterFailure(error, this.now().getTime(), {
        detectedVersion: row.detected_version,
        mode:
          row.mode === 'wireguard' || row.mode === 'amnezia' ? row.mode : null,
      });
      this.#persistProbeState(nodeId, state);
      if (!state.lastErrorCode) {
        throw new Error('Failed inventory probe has no safe error code');
      }
      return {
        ok: false,
        node: this.get(nodeId),
        errorCode: state.lastErrorCode,
      };
    }

    const state: ProbeState = {
      status: 'healthy',
      detectedVersion: probe.information.version,
      mode: probe.information.mode,
      lastErrorCode: null,
      checkedAt: this.now().getTime(),
    };
    this.#persistProbeState(nodeId, state);
    return {
      ok: true,
      node: this.get(nodeId),
      clients: probe.clients,
      upstreamVersion: probe.information.version,
    };
  }

  delete(nodeId: string): void {
    this.#requireRow(nodeId);
    const placement = this.connection.sqlite
      .prepare('select 1 from placements where node_id = ? limit 1')
      .get(nodeId);
    if (placement) {
      throw new NodeServiceError(
        'HAS_PLACEMENTS',
        'Node has managed placements',
      );
    }
    this.connection.sqlite
      .prepare('delete from nodes where id = ?')
      .run(nodeId);
  }

  #parseConnection(input: unknown): TestNodeConnectionRequest {
    const parsed = TestNodeConnectionRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw new NodeServiceError('INVALID_INPUT', 'Invalid node connection');
    }
    return parsed.data;
  }

  #assertUnique(
    name: string,
    endpoint: { protocol: NodeProtocol; host: string; port: number },
    excludeId: string | null,
  ): void {
    const row = this.connection.sqlite
      .prepare(
        `select id from nodes
         where (name = ? or (protocol = ? and host = ? and port = ?))
           and (? is null or id <> ?)
         limit 1`,
      )
      .get(
        name,
        endpoint.protocol,
        endpoint.host,
        endpoint.port,
        excludeId,
        excludeId,
      );
    if (row) throw new NodeServiceError('CONFLICT', 'Node already exists');
  }

  #requireRow(nodeId: string): NodeRow {
    if (!UUID_PATTERN.test(nodeId)) {
      throw new NodeServiceError('INVALID_INPUT', 'Invalid node identifier');
    }
    const row = this.connection.sqlite
      .prepare('select * from nodes where id = ? limit 1')
      .get(nodeId) as NodeRow | undefined;
    if (!row) throw new NodeServiceError('NOT_FOUND', 'Node does not exist');
    return row;
  }

  #persistProbeState(nodeId: string, probe: ProbeState): void {
    this.connection.sqlite
      .prepare(
        `update nodes set status = ?, detected_version = ?, mode = ?,
           last_checked_at = ?, last_error_code = ?, updated_at = ?
         where id = ?`,
      )
      .run(
        probe.status,
        probe.detectedVersion,
        probe.mode,
        probe.checkedAt,
        probe.lastErrorCode,
        probe.checkedAt,
        nodeId,
      );
  }

  async #probe(
    input: TestNodeConnectionRequest,
    prior?: { detectedVersion: string | null; mode: NodeMode | null },
  ): Promise<ProbeState> {
    const connection: WgEasyConnection = {
      ...input,
      timeoutMs: this.requestTimeoutMs,
    };
    try {
      const result = await this.adapterFactory(connection).probe();
      return {
        status: 'healthy',
        detectedVersion: result.information.version,
        mode: result.information.mode,
        lastErrorCode: null,
        checkedAt: this.now().getTime(),
      };
    } catch (error) {
      const checkedAt = this.now().getTime();
      if (error instanceof WgEasyAdapterError) {
        return mapAdapterFailure(error, checkedAt, prior);
      }
      throw error;
    }
  }
}

export const nodeServiceTestExports = { mapAdapterFailure };
