import type { DatabaseConnection } from '@wg-easy-plane/database';
import type { WgEasyLiveArtifact } from '@wg-easy-plane/wg-easy-adapter';

import { NodeMutationError, type NodeService } from './service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DeliveryGateway = Pick<
  NodeService,
  'getRemoteConfiguration' | 'getRemoteQrCode'
>;

type DeliveryTarget = {
  nodeId: string;
  remoteClientId: number;
  clientName: string;
  nodeName: string;
};

type ManagedTargetRow = {
  node_id: string;
  remote_client_id: number | null;
  placement_status: string;
  lifecycle_status: string;
  client_name: string;
  node_name: string;
  snapshot_remote_client_id: number | null;
  missing_at: number | null;
};

type DiscoveredTargetRow = {
  node_id: string;
  remote_client_id: number;
  client_name: string;
  node_name: string;
  missing_at: number | null;
  placement_id: string | null;
};

export type ConfigurationDelivery = WgEasyLiveArtifact & {
  mediaType: 'application/octet-stream';
  filename: string;
};

export type QrCodeDelivery = WgEasyLiveArtifact & {
  mediaType: 'image/svg+xml';
};

export type DeliveryServiceErrorCode =
  'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'UPSTREAM_ERROR';

export class DeliveryServiceError extends Error {
  constructor(readonly code: DeliveryServiceErrorCode) {
    super('Live client artifact is unavailable');
    this.name = 'DeliveryServiceError';
  }
}

function safeFilenameSegment(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
}

export function configurationFilename(
  clientName: string,
  nodeName: string,
): string {
  const basename = [clientName, nodeName]
    .map(safeFilenameSegment)
    .filter(Boolean)
    .join('-')
    .slice(0, 100)
    .replace(/-+$/g, '');
  return `${basename || 'wireguard-client'}.conf`;
}

export class ArtifactDeliveryService {
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly remote: DeliveryGateway,
  ) {}

  async getManagedConfiguration(
    clientId: string,
    placementId: string,
  ): Promise<ConfigurationDelivery> {
    const target = this.#managedTarget(clientId, placementId);
    const artifact = await this.#retrieve(() =>
      this.remote.getRemoteConfiguration(target.nodeId, target.remoteClientId),
    );
    if (artifact.mediaType !== 'application/octet-stream') {
      throw new DeliveryServiceError('UPSTREAM_ERROR');
    }
    return {
      bytes: artifact.bytes,
      mediaType: artifact.mediaType,
      filename: configurationFilename(target.clientName, target.nodeName),
    };
  }

  async getManagedQrCode(
    clientId: string,
    placementId: string,
  ): Promise<QrCodeDelivery> {
    const target = this.#managedTarget(clientId, placementId);
    return this.#qr(target);
  }

  async getDiscoveredConfiguration(
    nodeId: string,
    remoteClientId: number,
  ): Promise<ConfigurationDelivery> {
    const target = this.#discoveredTarget(nodeId, remoteClientId);
    const artifact = await this.#retrieve(() =>
      this.remote.getRemoteConfiguration(target.nodeId, target.remoteClientId),
    );
    if (artifact.mediaType !== 'application/octet-stream') {
      throw new DeliveryServiceError('UPSTREAM_ERROR');
    }
    return {
      bytes: artifact.bytes,
      mediaType: artifact.mediaType,
      filename: configurationFilename(target.clientName, target.nodeName),
    };
  }

  async getDiscoveredQrCode(
    nodeId: string,
    remoteClientId: number,
  ): Promise<QrCodeDelivery> {
    return this.#qr(this.#discoveredTarget(nodeId, remoteClientId));
  }

  async #qr(target: DeliveryTarget): Promise<QrCodeDelivery> {
    const artifact = await this.#retrieve(() =>
      this.remote.getRemoteQrCode(target.nodeId, target.remoteClientId),
    );
    if (artifact.mediaType !== 'image/svg+xml') {
      throw new DeliveryServiceError('UPSTREAM_ERROR');
    }
    return { bytes: artifact.bytes, mediaType: artifact.mediaType };
  }

  #managedTarget(clientId: string, placementId: string): DeliveryTarget {
    if (!UUID_PATTERN.test(clientId) || !UUID_PATTERN.test(placementId)) {
      throw new DeliveryServiceError('INVALID_INPUT');
    }
    const row = this.connection.sqlite
      .prepare(
        `select p.node_id, p.remote_client_id,
                p.status as placement_status,
                m.lifecycle_status, m.name as client_name,
                n.name as node_name,
                r.remote_client_id as snapshot_remote_client_id, r.missing_at
         from placements p
         join managed_clients m on m.id = p.managed_client_id
         join nodes n on n.id = p.node_id
         left join remote_clients r
           on r.node_id = p.node_id and r.remote_client_id = p.remote_client_id
         where m.id = ? and p.id = ? limit 1`,
      )
      .get(clientId, placementId) as ManagedTargetRow | undefined;
    if (!row) throw new DeliveryServiceError('NOT_FOUND');
    if (
      row.lifecycle_status !== 'active' ||
      row.remote_client_id === null ||
      row.snapshot_remote_client_id === null ||
      row.missing_at !== null ||
      !['active', 'drift', 'error'].includes(row.placement_status)
    ) {
      throw new DeliveryServiceError('CONFLICT');
    }
    return {
      nodeId: row.node_id,
      remoteClientId: row.remote_client_id,
      clientName: row.client_name,
      nodeName: row.node_name,
    };
  }

  #discoveredTarget(nodeId: string, remoteClientId: number): DeliveryTarget {
    if (
      !UUID_PATTERN.test(nodeId) ||
      !Number.isSafeInteger(remoteClientId) ||
      remoteClientId < 1
    ) {
      throw new DeliveryServiceError('INVALID_INPUT');
    }
    const row = this.connection.sqlite
      .prepare(
        `select r.node_id, r.remote_client_id, r.name as client_name,
                n.name as node_name, r.missing_at, p.id as placement_id
         from remote_clients r
         join nodes n on n.id = r.node_id
         left join placements p
           on p.node_id = r.node_id and p.remote_client_id = r.remote_client_id
         where r.node_id = ? and r.remote_client_id = ? limit 1`,
      )
      .get(nodeId, remoteClientId) as DiscoveredTargetRow | undefined;
    if (!row) throw new DeliveryServiceError('NOT_FOUND');
    if (row.missing_at !== null || row.placement_id !== null) {
      throw new DeliveryServiceError('CONFLICT');
    }
    return {
      nodeId: row.node_id,
      remoteClientId: row.remote_client_id,
      clientName: row.client_name,
      nodeName: row.node_name,
    };
  }

  async #retrieve(
    retrieve: () => Promise<WgEasyLiveArtifact>,
  ): Promise<WgEasyLiveArtifact> {
    try {
      return await retrieve();
    } catch (error) {
      if (error instanceof NodeMutationError) {
        throw new DeliveryServiceError(
          error.code === 'NODE_NOT_MUTABLE' ? 'CONFLICT' : 'UPSTREAM_ERROR',
        );
      }
      throw error;
    }
  }
}
