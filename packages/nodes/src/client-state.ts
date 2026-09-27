import {
  PLACEMENT_MUTABLE_FIELDS,
  PlacementDriftDifferenceSchema,
  PlacementMutableStateSchema,
  type PlacementDriftState,
  type PlacementMutableField,
  type PlacementMutableState,
} from '@wg-easy-plane/contracts';
import type { DatabaseConnection } from '@wg-easy-plane/database';
import {
  WgEasyClientSchema,
  WgEasyClientUpdateRequestSchema,
  type WgEasyClient,
  type WgEasyClientUpdateRequest,
} from '@wg-easy-plane/wg-easy-adapter';

export type ManagedSharedState = {
  name: string;
  expiresAt: string | null;
  enabled: boolean;
};

export type PlacementDesiredState =
  | ({ kind: 'shared' } & ManagedSharedState)
  | { kind: 'complete'; payload: WgEasyClientUpdateRequest };

export function sharedDesired(
  shared: ManagedSharedState,
): PlacementDesiredState {
  return { kind: 'shared', ...shared };
}

export function actualPayloadFromSnapshot(
  client: WgEasyClient,
): WgEasyClientUpdateRequest {
  return WgEasyClientUpdateRequestSchema.parse({
    name: client.name,
    enabled: client.enabled,
    expiresAt: client.expiresAt,
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

export function desiredPayloadFromSnapshot(
  client: WgEasyClient,
  shared: ManagedSharedState,
): WgEasyClientUpdateRequest {
  return WgEasyClientUpdateRequestSchema.parse({
    ...actualPayloadFromSnapshot(client),
    ...shared,
  });
}

export function parsePlacementDesired(
  value: string | null,
): PlacementDesiredState {
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
  const shared = parsed as Partial<
    Extract<PlacementDesiredState, { kind: 'shared' }>
  >;
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

export function mutableState(
  payload: WgEasyClientUpdateRequest,
): PlacementMutableState {
  return PlacementMutableStateSchema.parse(payload);
}

function fieldMatches(
  left: PlacementMutableState[PlacementMutableField],
  right: PlacementMutableState[PlacementMutableField],
): boolean {
  return Array.isArray(left) && Array.isArray(right)
    ? left.length === right.length &&
        left.every((value, index) => value === right[index])
    : left === right;
}

export function driftDifferences(
  desiredPayload: WgEasyClientUpdateRequest,
  remotePayload: WgEasyClientUpdateRequest,
): PlacementDriftState['differences'] {
  const desired = mutableState(desiredPayload);
  const remote = mutableState(remotePayload);
  return PLACEMENT_MUTABLE_FIELDS.flatMap((field) =>
    fieldMatches(desired[field], remote[field])
      ? []
      : [
          PlacementDriftDifferenceSchema.parse({
            field,
            desired: desired[field],
            remote: remote[field],
          }),
        ],
  );
}

type ReconcilePlacementRow = {
  id: string;
  status: string;
  desired_payload: string | null;
  name: string;
  expires_at: number | null;
  enabled: number;
  public_data: string | null;
  missing_at: number | null;
};

export function reconcileManagedPlacementsForNode(
  connection: DatabaseConnection,
  nodeId: string,
  reconciledAt: number,
): void {
  const rows = connection.sqlite
    .prepare(
      `select p.id, p.status, p.desired_payload,
              m.name, m.expires_at, m.enabled,
              r.public_data, r.missing_at
       from placements p
       join managed_clients m on m.id = p.managed_client_id
       left join remote_clients r
         on r.node_id = p.node_id and r.remote_client_id = p.remote_client_id
       where p.node_id = ? and p.remote_client_id is not null`,
    )
    .all(nodeId) as ReconcilePlacementRow[];
  const update = connection.sqlite.prepare(
    `update placements set desired_payload = ?, status = ?, last_error_code = ?,
       updated_at = ? where id = ?`,
  );

  for (const row of rows) {
    if (row.status === 'deleting' || row.status === 'ambiguous') continue;
    const stored = parsePlacementDesired(row.desired_payload);
    if (!row.public_data || row.missing_at !== null) {
      const desired =
        stored.kind === 'complete' || !row.public_data
          ? stored
          : {
              kind: 'complete' as const,
              payload: desiredPayloadFromSnapshot(
                WgEasyClientSchema.parse(JSON.parse(row.public_data)),
                {
                  name: row.name,
                  expiresAt:
                    row.expires_at === null
                      ? null
                      : new Date(row.expires_at).toISOString(),
                  enabled: row.enabled === 1,
                },
              ),
            };
      update.run(
        JSON.stringify(desired),
        'missing',
        'SNAPSHOT_MISSING',
        reconciledAt,
        row.id,
      );
      continue;
    }
    const remote = actualPayloadFromSnapshot(
      WgEasyClientSchema.parse(JSON.parse(row.public_data)),
    );
    const desired =
      stored.kind === 'complete'
        ? stored.payload
        : WgEasyClientUpdateRequestSchema.parse({
            ...remote,
            name: row.name,
            expiresAt:
              row.expires_at === null
                ? null
                : new Date(row.expires_at).toISOString(),
            enabled: row.enabled === 1,
          });
    const status =
      driftDifferences(desired, remote).length === 0 ? 'active' : 'drift';
    update.run(
      JSON.stringify({ kind: 'complete', payload: desired }),
      status,
      null,
      reconciledAt,
      row.id,
    );
  }
}
