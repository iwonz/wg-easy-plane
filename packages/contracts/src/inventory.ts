import { createRoute, z } from '@hono/zod-openapi';

import { NodeErrorCodeSchema, NodeModeSchema, NodeStatusSchema } from './nodes';
import {
  CursorPageSchema,
  CursorQuerySchema,
  ErrorResponseSchema,
  RequestIdHeaderSchema,
} from './schemas';

export const SYNC_RUN_STATUSES = ['succeeded', 'failed'] as const;
export const SyncRunStatusSchema = z
  .enum(SYNC_RUN_STATUSES)
  .openapi('SyncRunStatus');
export const SyncErrorCodeSchema = z
  .union([NodeErrorCodeSchema, z.enum(['INTERRUPTED', 'INTERNAL_ERROR'])])
  .openapi('SyncErrorCode');

export const SyncRunSummarySchema = z
  .object({
    id: z.uuid(),
    nodeId: z.uuid(),
    status: SyncRunStatusSchema,
    seenCount: z.number().int().nonnegative(),
    missingCount: z.number().int().nonnegative(),
    errorCode: SyncErrorCodeSchema.nullable(),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime(),
  })
  .strict()
  .openapi('SyncRunSummary');

export const DiscoveredClientPublicDataSchema = z
  .object({
    name: z.string().min(1),
    enabled: z.boolean(),
    expiresAt: z.iso.datetime().nullable(),
    ipv4Address: z.string().min(1),
    ipv6Address: z.string().min(1),
    latestHandshakeAt: z.iso.datetime().nullable(),
    transferRx: z.number().nonnegative().nullable(),
    transferTx: z.number().nonnegative().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict()
  .openapi('DiscoveredClientPublicData');

export const DiscoveredClientSchema = z
  .object({
    nodeId: z.uuid(),
    nodeName: z.string().min(1),
    nodeMode: NodeModeSchema.nullable(),
    nodeStatus: NodeStatusSchema,
    remoteClientId: z.number().int().positive(),
    publicData: DiscoveredClientPublicDataSchema,
    upstreamVersion: z.literal('15.4.0'),
    firstSeenAt: z.iso.datetime(),
    lastSeenAt: z.iso.datetime(),
    missingAt: z.iso.datetime().nullable(),
  })
  .strict()
  .openapi('DiscoveredClient');

export const DiscoveredClientListSchema = z
  .object({
    items: z.array(DiscoveredClientSchema),
    page: CursorPageSchema,
  })
  .strict()
  .openapi('DiscoveredClientList');

export type SyncRunStatus = z.infer<typeof SyncRunStatusSchema>;
export type SyncErrorCode = z.infer<typeof SyncErrorCodeSchema>;
export type SyncRunSummary = z.infer<typeof SyncRunSummarySchema>;
export type DiscoveredClientPublicData = z.infer<
  typeof DiscoveredClientPublicDataSchema
>;
export type DiscoveredClient = z.infer<typeof DiscoveredClientSchema>;

const jsonResponse = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
  headers: RequestIdHeaderSchema,
});

const errorResponse = (description: string) =>
  jsonResponse(ErrorResponseSchema, description);

const authenticatedSecurity: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { bearerAuth: [] },
];

export const syncNodeRoute = createRoute({
  method: 'post',
  path: '/v1/nodes/{nodeId}/sync',
  operationId: 'syncNode',
  tags: ['Nodes'],
  summary: 'Synchronize one node client inventory',
  security: authenticatedSecurity,
  request: { params: z.object({ nodeId: z.uuid() }) },
  responses: {
    200: jsonResponse(SyncRunSummarySchema, 'Safe synchronization summary'),
    400: errorResponse('Invalid node identifier'),
    401: errorResponse('Authentication is required'),
    403: errorResponse('Untrusted origin or insufficient scope'),
    404: errorResponse('Node does not exist'),
    409: errorResponse('Node synchronization is already active'),
    500: errorResponse('Unexpected server error'),
  },
});

export const listDiscoveredClientsRoute = createRoute({
  method: 'get',
  path: '/v1/clients/discovered',
  operationId: 'listDiscoveredClients',
  tags: ['Clients'],
  summary: 'List read-only clients discovered on nodes',
  security: authenticatedSecurity,
  request: { query: CursorQuerySchema },
  responses: {
    200: jsonResponse(
      DiscoveredClientListSchema,
      'Cursor-paginated safe discovered-client snapshots',
    ),
    400: errorResponse('Invalid pagination cursor or limit'),
    401: errorResponse('Authentication is required'),
    403: errorResponse('The credential lacks client-read authority'),
    500: errorResponse('Unexpected server error'),
  },
});
