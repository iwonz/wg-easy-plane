import { createRoute, z } from '@hono/zod-openapi';

import { NodeModeSchema } from './nodes';
import {
  CursorPageSchema,
  CursorQuerySchema,
  ErrorResponseSchema,
  RequestIdHeaderSchema,
} from './schemas';

export const MANAGED_CLIENT_LIFECYCLE_STATUSES = [
  'active',
  'deleting',
] as const;
export const ManagedClientLifecycleStatusSchema = z
  .enum(MANAGED_CLIENT_LIFECYCLE_STATUSES)
  .openapi('ManagedClientLifecycleStatus');

export const PLACEMENT_STATUSES = [
  'pending',
  'active',
  'error',
  'drift',
  'missing',
  'deleting',
  'ambiguous',
] as const;
export const PlacementStatusSchema = z
  .enum(PLACEMENT_STATUSES)
  .openapi('PlacementStatus');

export const ManagedPlacementSchema = z
  .object({
    id: z.uuid(),
    nodeId: z.uuid(),
    nodeName: z.string().min(1),
    nodeMode: NodeModeSchema.nullable(),
    remoteClientId: z.number().int().positive().nullable(),
    status: PlacementStatusSchema,
    lastErrorCode: z.string().min(1).nullable(),
    desiredHydrated: z.boolean(),
    lastAttemptAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict()
  .openapi('ManagedPlacement');

export const ManagedClientSchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1),
    expiresAt: z.iso.datetime().nullable(),
    enabled: z.boolean(),
    lifecycleStatus: ManagedClientLifecycleStatusSchema,
    placements: z.array(ManagedPlacementSchema),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict()
  .openapi('ManagedClient');

export const ManagedClientListSchema = z
  .object({ items: z.array(ManagedClientSchema), page: CursorPageSchema })
  .strict()
  .openapi('ManagedClientList');

export const ManagedClientMutationResultSchema = z
  .object({
    deleted: z.boolean(),
    client: ManagedClientSchema.nullable(),
  })
  .strict()
  .openapi('ManagedClientMutationResult');

const nodeIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(100)
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        message: 'Node identifiers must be unique',
      });
    }
  });

export const CreateManagedClientRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    expiresAt: z.iso.datetime().nullable().optional(),
    nodeIds: nodeIdsSchema,
  })
  .strict()
  .openapi('CreateManagedClientRequest');

export const UpdateManagedClientRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    expiresAt: z.iso.datetime().nullable().optional(),
  })
  .strict()
  .refine(
    (value) => value.name !== undefined || value.expiresAt !== undefined,
    {
      message: 'At least one shared field is required',
    },
  )
  .openapi('UpdateManagedClientRequest');

export const AddManagedPlacementRequestSchema = z
  .object({ nodeId: z.uuid() })
  .strict()
  .openapi('AddManagedPlacementRequest');

export const LinkManagedPlacementRequestSchema = z
  .object({ remoteClientId: z.number().int().positive() })
  .strict()
  .openapi('LinkManagedPlacementRequest');

export const AmbiguousCreateCandidateSchema = z
  .object({
    nodeId: z.uuid(),
    remoteClientId: z.number().int().positive(),
    name: z.string().min(1),
    enabled: z.boolean(),
    expiresAt: z.iso.datetime().nullable(),
    lastSeenAt: z.iso.datetime(),
  })
  .strict()
  .openapi('AmbiguousCreateCandidate');

export const AmbiguousCreateCandidateListSchema = z
  .object({ items: z.array(AmbiguousCreateCandidateSchema) })
  .strict()
  .openapi('AmbiguousCreateCandidateList');

const prototypeSafeString = z
  .string()
  .refine(
    (value) =>
      value !== '__proto__' && value !== 'constructor' && value !== 'prototype',
  );
const controlSafeString = prototypeSafeString.refine(
  (value) => !/[\x00-\x1f\x7f]/.test(value),
);
const addressString = controlSafeString.min(1);

export const PlacementAdvancedValuesSchema = z
  .object({
    ipv4Address: z.string().min(1),
    ipv6Address: z.string().min(1),
    preUp: prototypeSafeString,
    postUp: prototypeSafeString,
    preDown: prototypeSafeString,
    postDown: prototypeSafeString,
    allowedIps: z.array(addressString).nullable(),
    serverAllowedIps: z.array(addressString),
    firewallIps: z.array(addressString).nullable(),
    mtu: z.number().min(1_024).max(9_000),
    jC: z.number().min(1).max(128).nullable(),
    jMin: z.number().max(1_279).nullable(),
    jMax: z.number().max(1_280).nullable(),
    i1: controlSafeString.nullable(),
    i2: controlSafeString.nullable(),
    i3: controlSafeString.nullable(),
    i4: controlSafeString.nullable(),
    i5: controlSafeString.nullable(),
    persistentKeepalive: z.number().min(0).max(65_535),
    serverEndpoint: addressString.nullable(),
    dns: z.array(addressString).nullable(),
  })
  .strict()
  .openapi('PlacementAdvancedValues');

export const PlacementAdvancedStateSchema = z
  .object({
    clientId: z.uuid(),
    placementId: z.uuid(),
    nodeId: z.uuid(),
    nodeName: z.string().min(1),
    nodeMode: NodeModeSchema,
    status: PlacementStatusSchema,
    supportedAwgGeneration: z.union([z.literal('legacy'), z.null()]),
    values: PlacementAdvancedValuesSchema,
  })
  .strict()
  .openapi('PlacementAdvancedState');

export const PLACEMENT_MUTABLE_FIELDS = [
  'name',
  'enabled',
  'expiresAt',
  'ipv4Address',
  'ipv6Address',
  'preUp',
  'postUp',
  'preDown',
  'postDown',
  'allowedIps',
  'serverAllowedIps',
  'firewallIps',
  'mtu',
  'jC',
  'jMin',
  'jMax',
  'i1',
  'i2',
  'i3',
  'i4',
  'i5',
  'persistentKeepalive',
  'serverEndpoint',
  'dns',
] as const;

export const PlacementMutableStateSchema = z
  .object({
    name: z.string().min(1),
    enabled: z.boolean(),
    expiresAt: z.iso.datetime().nullable(),
    ...PlacementAdvancedValuesSchema.shape,
  })
  .strict()
  .openapi('PlacementMutableState');

export const PlacementMutableFieldSchema = z
  .enum(PLACEMENT_MUTABLE_FIELDS)
  .openapi('PlacementMutableField');

const DriftValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()),
]);

export const PlacementDriftDifferenceSchema = z
  .object({
    field: PlacementMutableFieldSchema,
    desired: DriftValueSchema,
    remote: DriftValueSchema,
  })
  .strict()
  .openapi('PlacementDriftDifference');

export const PlacementDriftStateSchema = z
  .object({
    clientId: z.uuid(),
    placementId: z.uuid(),
    nodeId: z.uuid(),
    nodeName: z.string().min(1),
    nodeMode: NodeModeSchema,
    status: PlacementStatusSchema,
    snapshotAt: z.iso.datetime().nullable(),
    desired: PlacementMutableStateSchema,
    remote: PlacementMutableStateSchema.nullable(),
    differences: z.array(PlacementDriftDifferenceSchema),
  })
  .strict()
  .openapi('PlacementDriftState');

const AdoptionSelectionSchema = z
  .object({
    nodeId: z.uuid(),
    remoteClientId: z.number().int().positive(),
  })
  .strict();

export const AdoptManagedClientRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    expiresAt: z.iso.datetime().nullable().optional(),
    enabled: z.boolean().default(true),
    selections: z
      .array(AdoptionSelectionSchema)
      .min(1)
      .max(100)
      .superRefine((selections, context) => {
        const nodes = new Set<string>();
        for (const [index, selection] of selections.entries()) {
          if (nodes.has(selection.nodeId)) {
            context.addIssue({
              code: 'custom',
              path: [index, 'nodeId'],
              message: 'Only one remote client may be selected per node',
            });
          }
          nodes.add(selection.nodeId);
        }
      }),
  })
  .strict()
  .openapi('AdoptManagedClientRequest');

export type ManagedClient = z.infer<typeof ManagedClientSchema>;
export type ManagedPlacement = z.infer<typeof ManagedPlacementSchema>;
export type ManagedClientMutationResult = z.infer<
  typeof ManagedClientMutationResultSchema
>;
export type PlacementStatus = z.infer<typeof PlacementStatusSchema>;
export type CreateManagedClientRequest = z.infer<
  typeof CreateManagedClientRequestSchema
>;
export type UpdateManagedClientRequest = z.infer<
  typeof UpdateManagedClientRequestSchema
>;
export type AmbiguousCreateCandidate = z.infer<
  typeof AmbiguousCreateCandidateSchema
>;
export type PlacementAdvancedValues = z.infer<
  typeof PlacementAdvancedValuesSchema
>;
export type PlacementAdvancedState = z.infer<
  typeof PlacementAdvancedStateSchema
>;
export type PlacementMutableState = z.infer<typeof PlacementMutableStateSchema>;
export type PlacementMutableField = z.infer<typeof PlacementMutableFieldSchema>;
export type PlacementDriftState = z.infer<typeof PlacementDriftStateSchema>;
export type AdoptManagedClientRequest = z.infer<
  typeof AdoptManagedClientRequestSchema
>;

const jsonResponse = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
  headers: RequestIdHeaderSchema,
});
const errorResponse = (description: string) =>
  jsonResponse(ErrorResponseSchema, description);
const security: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { bearerAuth: [] },
];
const clientParams = z.object({ clientId: z.uuid() });
const placementParams = z.object({ clientId: z.uuid(), placementId: z.uuid() });
const commonErrors = {
  400: errorResponse('Invalid input'),
  401: errorResponse('Authentication is required'),
  403: errorResponse('Untrusted origin or insufficient scope'),
  404: errorResponse('Managed client, placement, or node does not exist'),
  409: errorResponse('The requested lifecycle transition is not safe'),
  500: errorResponse('Unexpected server error'),
} as const;

export const listManagedClientsRoute = createRoute({
  method: 'get',
  path: '/v1/clients/managed',
  operationId: 'listManagedClients',
  tags: ['Clients'],
  summary: 'List managed clients and their placements',
  security,
  request: { query: CursorQuerySchema },
  responses: {
    200: jsonResponse(ManagedClientListSchema, 'Managed clients'),
    ...commonErrors,
  },
});

export const createManagedClientRoute = createRoute({
  method: 'post',
  path: '/v1/clients/managed',
  operationId: 'createManagedClient',
  tags: ['Clients'],
  summary: 'Create a client on one or more nodes',
  security,
  request: {
    body: {
      content: {
        'application/json': { schema: CreateManagedClientRequestSchema },
      },
    },
  },
  responses: {
    201: jsonResponse(
      ManagedClientSchema,
      'Created managed client with per-node results',
    ),
    ...commonErrors,
  },
});

export const adoptManagedClientRoute = createRoute({
  method: 'post',
  path: '/v1/clients/managed/adopt',
  operationId: 'adoptManagedClient',
  tags: ['Clients'],
  summary: 'Adopt explicit unlinked remote clients without mutating upstream',
  security,
  request: {
    body: {
      content: {
        'application/json': { schema: AdoptManagedClientRequestSchema },
      },
    },
  },
  responses: {
    201: jsonResponse(ManagedClientSchema, 'Adopted managed client'),
    ...commonErrors,
  },
});

export const getManagedClientRoute = createRoute({
  method: 'get',
  path: '/v1/clients/managed/{clientId}',
  operationId: 'getManagedClient',
  tags: ['Clients'],
  summary: 'Get one managed client',
  security,
  request: { params: clientParams },
  responses: {
    200: jsonResponse(ManagedClientSchema, 'Managed client'),
    ...commonErrors,
  },
});

export const updateManagedClientRoute = createRoute({
  method: 'patch',
  path: '/v1/clients/managed/{clientId}',
  operationId: 'updateManagedClient',
  tags: ['Clients'],
  summary: 'Update shared fields on all placements',
  security,
  request: {
    params: clientParams,
    body: {
      content: {
        'application/json': { schema: UpdateManagedClientRequestSchema },
      },
    },
  },
  responses: {
    200: jsonResponse(
      ManagedClientSchema,
      'Updated client with per-node results',
    ),
    ...commonErrors,
  },
});

export const enableManagedClientRoute = createRoute({
  method: 'post',
  path: '/v1/clients/managed/{clientId}/enable',
  operationId: 'enableManagedClient',
  tags: ['Clients'],
  summary: 'Enable every managed placement',
  security,
  request: { params: clientParams },
  responses: {
    200: jsonResponse(
      ManagedClientSchema,
      'Enabled client with per-node results',
    ),
    ...commonErrors,
  },
});

export const disableManagedClientRoute = createRoute({
  method: 'post',
  path: '/v1/clients/managed/{clientId}/disable',
  operationId: 'disableManagedClient',
  tags: ['Clients'],
  summary: 'Disable every managed placement',
  security,
  request: { params: clientParams },
  responses: {
    200: jsonResponse(
      ManagedClientSchema,
      'Disabled client with per-node results',
    ),
    ...commonErrors,
  },
});

export const deleteManagedClientRoute = createRoute({
  method: 'delete',
  path: '/v1/clients/managed/{clientId}',
  operationId: 'deleteManagedClient',
  tags: ['Clients'],
  summary: 'Tombstone and delete every placement',
  security,
  request: { params: clientParams },
  responses: {
    202: jsonResponse(
      ManagedClientMutationResultSchema,
      'Deletion result; failed placements remain tombstoned',
    ),
    ...commonErrors,
  },
});

export const addManagedPlacementRoute = createRoute({
  method: 'post',
  path: '/v1/clients/managed/{clientId}/placements',
  operationId: 'addManagedPlacement',
  tags: ['Clients'],
  summary: 'Create an additional placement',
  security,
  request: {
    params: clientParams,
    body: {
      content: {
        'application/json': { schema: AddManagedPlacementRequestSchema },
      },
    },
  },
  responses: {
    201: jsonResponse(ManagedClientSchema, 'Client with the added placement'),
    ...commonErrors,
  },
});

export const removeManagedPlacementRoute = createRoute({
  method: 'delete',
  path: '/v1/clients/managed/{clientId}/placements/{placementId}',
  operationId: 'removeManagedPlacement',
  tags: ['Clients'],
  summary: 'Delete one placement using a tombstone',
  security,
  request: { params: placementParams },
  responses: {
    200: jsonResponse(
      ManagedClientMutationResultSchema,
      'Client after placement deletion attempt',
    ),
    ...commonErrors,
  },
});

export const retryManagedPlacementRoute = createRoute({
  method: 'post',
  path: '/v1/clients/managed/{clientId}/placements/{placementId}/retry',
  operationId: 'retryManagedPlacement',
  tags: ['Clients'],
  summary: 'Retry a failed durable placement operation',
  security,
  request: { params: placementParams },
  responses: {
    200: jsonResponse(ManagedClientMutationResultSchema, 'Client after retry'),
    ...commonErrors,
  },
});

export const getPlacementAdvancedRoute = createRoute({
  method: 'get',
  path: '/v1/clients/managed/{clientId}/placements/{placementId}/advanced',
  operationId: 'getPlacementAdvanced',
  tags: ['Clients'],
  summary: 'Read the complete safe advanced placement state',
  security,
  request: { params: placementParams },
  responses: {
    200: jsonResponse(
      PlacementAdvancedStateSchema,
      'Safe mutable fields for the selected placement',
    ),
    ...commonErrors,
  },
});

export const updatePlacementAdvancedRoute = createRoute({
  method: 'patch',
  path: '/v1/clients/managed/{clientId}/placements/{placementId}/advanced',
  operationId: 'updatePlacementAdvanced',
  tags: ['Clients'],
  summary: 'Replace the complete advanced state for one placement',
  security,
  request: {
    params: placementParams,
    body: {
      content: {
        'application/json': { schema: PlacementAdvancedValuesSchema },
      },
    },
  },
  responses: {
    200: jsonResponse(
      PlacementAdvancedStateSchema,
      'Placement state after the update attempt',
    ),
    ...commonErrors,
  },
});

export const getPlacementDriftRoute = createRoute({
  method: 'get',
  path: '/v1/clients/managed/{clientId}/placements/{placementId}/drift',
  operationId: 'getPlacementDrift',
  tags: ['Clients'],
  summary: 'Inspect safe desired and remote placement differences',
  security,
  request: { params: placementParams },
  responses: {
    200: jsonResponse(PlacementDriftStateSchema, 'Safe placement drift state'),
    ...commonErrors,
  },
});

const placementResolutionRoute = (
  path: string,
  operationId: string,
  summary: string,
) =>
  createRoute({
    method: 'post',
    path,
    operationId,
    tags: ['Clients'],
    summary,
    security,
    request: { params: placementParams },
    responses: {
      200: jsonResponse(ManagedClientSchema, 'Managed client after resolution'),
      ...commonErrors,
    },
  });

export const acceptPlacementRemoteRoute = placementResolutionRoute(
  '/v1/clients/managed/{clientId}/placements/{placementId}/accept-remote',
  'acceptPlacementRemote',
  'Accept current remote state as desired',
);

export const reapplyPlacementDesiredRoute = placementResolutionRoute(
  '/v1/clients/managed/{clientId}/placements/{placementId}/reapply-desired',
  'reapplyPlacementDesired',
  'Reapply durable desired state to one placement',
);

export const recreateMissingPlacementRoute = placementResolutionRoute(
  '/v1/clients/managed/{clientId}/placements/{placementId}/recreate',
  'recreateMissingPlacement',
  'Create a fresh remote client for a missing placement',
);

export const listAmbiguousCandidatesRoute = createRoute({
  method: 'get',
  path: '/v1/clients/managed/{clientId}/placements/{placementId}/candidates',
  operationId: 'listAmbiguousCreateCandidates',
  tags: ['Clients'],
  summary: 'List explicit candidates after an ambiguous create',
  security,
  request: { params: placementParams },
  responses: {
    200: jsonResponse(
      AmbiguousCreateCandidateListSchema,
      'Unlinked same-name candidates',
    ),
    ...commonErrors,
  },
});

export const linkAmbiguousCandidateRoute = createRoute({
  method: 'post',
  path: '/v1/clients/managed/{clientId}/placements/{placementId}/link',
  operationId: 'linkAmbiguousCreateCandidate',
  tags: ['Clients'],
  summary: 'Explicitly link an ambiguous placement candidate',
  security,
  request: {
    params: placementParams,
    body: {
      content: {
        'application/json': { schema: LinkManagedPlacementRequestSchema },
      },
    },
  },
  responses: {
    200: jsonResponse(ManagedClientSchema, 'Client with linked placement'),
    ...commonErrors,
  },
});

export const cancelAmbiguousPlacementRoute = createRoute({
  method: 'post',
  path: '/v1/clients/managed/{clientId}/placements/{placementId}/cancel',
  operationId: 'cancelAmbiguousPlacement',
  tags: ['Clients'],
  summary: 'Remove the local ambiguous placement without mutating upstream',
  security,
  request: { params: placementParams },
  responses: {
    200: jsonResponse(
      ManagedClientMutationResultSchema,
      'Client after local cancellation',
    ),
    ...commonErrors,
  },
});
