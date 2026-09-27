import type { DatabaseConnection } from '@wg-easy-plane/database';

import {
  ArtifactDeliveryService,
  DeliveryServiceError,
  type ConfigurationDelivery,
  type QrCodeDelivery,
} from './delivery';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SubscriptionClientStatus =
  'active' | 'disabled' | 'expired' | 'deleting';
export type SubscriptionPlacementAvailability =
  | 'available'
  | 'client_unavailable'
  | 'node_unavailable'
  | 'placement_unavailable';

export type SubscriptionSummary = {
  clientId: string;
  name: string;
  expiresAt: string | null;
  enabled: boolean;
  status: SubscriptionClientStatus;
  placements: {
    id: string;
    nodeName: string;
    nodeMode: 'wireguard' | 'amnezia' | null;
    availability: SubscriptionPlacementAvailability;
  }[];
};

export type SubscriptionReadErrorCode =
  'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'UPSTREAM_ERROR';

export class SubscriptionReadError extends Error {
  constructor(readonly code: SubscriptionReadErrorCode) {
    super('Subscription resource is unavailable');
    this.name = 'SubscriptionReadError';
  }
}

type ClientRow = {
  id: string;
  name: string;
  expires_at: number | null;
  enabled: number;
  lifecycle_status: string;
};

type PlacementRow = {
  id: string;
  node_name: string;
  node_mode: 'wireguard' | 'amnezia' | null;
  node_status: string;
  detected_version: string | null;
  placement_status: string;
  remote_client_id: number | null;
  snapshot_remote_client_id: number | null;
  missing_at: number | null;
};

function clientStatus(row: ClientRow, nowMs: number): SubscriptionClientStatus {
  if (row.lifecycle_status !== 'active') return 'deleting';
  if (!row.enabled) return 'disabled';
  if (row.expires_at !== null && row.expires_at <= nowMs) return 'expired';
  return 'active';
}

function placementAvailability(
  row: PlacementRow,
  status: SubscriptionClientStatus,
): SubscriptionPlacementAvailability {
  if (status !== 'active') return 'client_unavailable';
  if (
    row.node_status !== 'healthy' ||
    row.detected_version !== '15.4.0' ||
    row.node_mode === null
  ) {
    return 'node_unavailable';
  }
  if (
    row.remote_client_id === null ||
    row.snapshot_remote_client_id === null ||
    row.missing_at !== null ||
    !['active', 'drift', 'error'].includes(row.placement_status)
  ) {
    return 'placement_unavailable';
  }
  return 'available';
}

export class SubscriptionReadService {
  private readonly now: () => Date;

  constructor(
    private readonly connection: DatabaseConnection,
    private readonly delivery: Pick<
      ArtifactDeliveryService,
      'getManagedConfiguration' | 'getManagedQrCode'
    >,
    options?: { now?: () => Date },
  ) {
    this.now = options?.now ?? (() => new Date());
  }

  getSummary(clientId: string): SubscriptionSummary {
    const client = this.#client(clientId);
    const status = clientStatus(client, this.now().getTime());
    const placements = this.connection.sqlite
      .prepare(
        `select p.id, n.name as node_name, n.mode as node_mode,
                n.status as node_status, n.detected_version,
                p.status as placement_status, p.remote_client_id,
                r.remote_client_id as snapshot_remote_client_id, r.missing_at
         from placements p
         join nodes n on n.id = p.node_id
         left join remote_clients r
           on r.node_id = p.node_id and r.remote_client_id = p.remote_client_id
         where p.managed_client_id = ?
         order by n.name asc, p.id asc`,
      )
      .all(clientId) as PlacementRow[];
    return {
      clientId: client.id,
      name: client.name,
      expiresAt:
        client.expires_at === null
          ? null
          : new Date(client.expires_at).toISOString(),
      enabled: Boolean(client.enabled),
      status,
      placements: placements.map((placement) => ({
        id: placement.id,
        nodeName: placement.node_name,
        nodeMode: placement.node_mode,
        availability: placementAvailability(placement, status),
      })),
    };
  }

  async getConfiguration(
    clientId: string,
    placementId: string,
  ): Promise<ConfigurationDelivery> {
    this.#assertClientAvailable(clientId);
    return this.#deliver(() =>
      this.delivery.getManagedConfiguration(clientId, placementId),
    );
  }

  async getQrCode(
    clientId: string,
    placementId: string,
  ): Promise<QrCodeDelivery> {
    this.#assertClientAvailable(clientId);
    return this.#deliver(() =>
      this.delivery.getManagedQrCode(clientId, placementId),
    );
  }

  #client(clientId: string): ClientRow {
    if (!UUID_PATTERN.test(clientId)) {
      throw new SubscriptionReadError('INVALID_INPUT');
    }
    const row = this.connection.sqlite
      .prepare(
        `select id, name, expires_at, enabled, lifecycle_status
         from managed_clients where id = ? limit 1`,
      )
      .get(clientId) as ClientRow | undefined;
    if (!row) throw new SubscriptionReadError('NOT_FOUND');
    return row;
  }

  #assertClientAvailable(clientId: string): void {
    const client = this.#client(clientId);
    if (clientStatus(client, this.now().getTime()) !== 'active') {
      throw new SubscriptionReadError('CONFLICT');
    }
  }

  async #deliver<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DeliveryServiceError) {
        throw new SubscriptionReadError(error.code);
      }
      throw error;
    }
  }
}
