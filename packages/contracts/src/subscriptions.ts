import { createRoute, z } from '@hono/zod-openapi';

import { ErrorResponseSchema, RequestIdHeaderSchema } from './schemas';

const adminSecurity: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { bearerAuth: [] },
];
const subscriptionSecurity: Record<string, string[]>[] = [
  { subscriptionSession: [] },
];
const privateHeaders = RequestIdHeaderSchema.extend({
  'Cache-Control': z.literal('private, no-store'),
  Pragma: z.literal('no-cache'),
  Expires: z.literal('0'),
});
const clientParams = z.object({ clientId: z.uuid() });
const placementParams = z.object({ placementId: z.uuid() });
const binaryBody = z.string().openapi({ format: 'binary' });

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorResponseSchema } },
  headers: privateHeaders,
});

export const SubscriptionLinkSchema = z
  .object({
    clientId: z.uuid(),
    status: z.enum(['missing', 'active', 'revoked']),
    prefix: z.string().startsWith('wgep_sub_').nullable(),
    url: z.url().nullable(),
    version: z.number().int().positive().nullable(),
    createdAt: z.iso.datetime().nullable(),
    rotatedAt: z.iso.datetime().nullable(),
    revokedAt: z.iso.datetime().nullable(),
  })
  .strict()
  .openapi('SubscriptionLink');

export const SubscriptionExchangeRequestSchema = z
  .object({
    token: z.string().regex(/^wgep_sub_[A-Za-z0-9_-]{43}$/),
  })
  .strict()
  .openapi('SubscriptionExchangeRequest');

export const SubscriptionExchangeResponseSchema = z
  .object({ sessionExpiresAt: z.iso.datetime() })
  .strict()
  .openapi('SubscriptionExchangeResponse');

export const SubscriptionPlacementSchema = z
  .object({
    id: z.uuid(),
    nodeName: z.string().min(1),
    nodeMode: z.enum(['wireguard', 'amnezia']).nullable(),
    availability: z.enum([
      'available',
      'client_unavailable',
      'node_unavailable',
      'placement_unavailable',
    ]),
  })
  .strict()
  .openapi('SubscriptionPlacement');

export const SubscriptionSummarySchema = z
  .object({
    clientId: z.uuid(),
    name: z.string().min(1),
    expiresAt: z.iso.datetime().nullable(),
    enabled: z.boolean(),
    status: z.enum(['active', 'disabled', 'expired', 'deleting']),
    placements: z.array(SubscriptionPlacementSchema),
  })
  .strict()
  .openapi('SubscriptionSummary');

export type SubscriptionLink = z.infer<typeof SubscriptionLinkSchema>;
export type SubscriptionExchangeRequest = z.infer<
  typeof SubscriptionExchangeRequestSchema
>;
export type SubscriptionSummary = z.infer<typeof SubscriptionSummarySchema>;

const adminErrors = {
  400: errorResponse('Invalid managed client identity'),
  401: errorResponse('Authentication is required'),
  403: errorResponse('Insufficient scope'),
  404: errorResponse('Managed client or subscription does not exist'),
  409: errorResponse('Subscription link cannot be changed in this state'),
  500: errorResponse('Unexpected server error'),
} as const;

export const getSubscriptionLinkRoute = createRoute({
  method: 'get',
  path: '/v1/clients/managed/{clientId}/subscription',
  operationId: 'getSubscriptionLink',
  tags: ['Subscriptions'],
  summary: 'Read the managed client subscription link state',
  security: adminSecurity,
  request: { params: clientParams },
  responses: {
    200: {
      description: 'Subscription link state and recoverable active URL',
      content: { 'application/json': { schema: SubscriptionLinkSchema } },
      headers: privateHeaders,
    },
    ...adminErrors,
  },
});

export const rotateSubscriptionLinkRoute = createRoute({
  method: 'post',
  path: '/v1/clients/managed/{clientId}/subscription',
  operationId: 'rotateSubscriptionLink',
  tags: ['Subscriptions'],
  summary: 'Create or rotate a managed client subscription link',
  security: adminSecurity,
  request: { params: clientParams },
  responses: {
    200: {
      description: 'New active subscription link',
      content: { 'application/json': { schema: SubscriptionLinkSchema } },
      headers: privateHeaders,
    },
    ...adminErrors,
  },
});

export const revokeSubscriptionLinkRoute = createRoute({
  method: 'delete',
  path: '/v1/clients/managed/{clientId}/subscription',
  operationId: 'revokeSubscriptionLink',
  tags: ['Subscriptions'],
  summary: 'Revoke a managed client subscription link',
  security: adminSecurity,
  request: { params: clientParams },
  responses: {
    204: {
      description: 'Subscription access revoked',
      headers: privateHeaders,
    },
    ...adminErrors,
  },
});

export const exchangeSubscriptionTokenRoute = createRoute({
  method: 'post',
  path: '/v1/subscriptions/exchange',
  operationId: 'exchangeSubscriptionToken',
  tags: ['Subscription access'],
  summary: 'Exchange a fragment token for an HttpOnly session cookie',
  request: {
    body: {
      required: true,
      content: {
        'application/json': { schema: SubscriptionExchangeRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Subscription session established',
      content: {
        'application/json': { schema: SubscriptionExchangeResponseSchema },
      },
      headers: privateHeaders.extend({ 'Set-Cookie': z.string().min(1) }),
    },
    400: errorResponse('Invalid exchange payload'),
    401: errorResponse('Subscription token is invalid'),
    429: errorResponse('Too many exchange attempts'),
    500: errorResponse('Unexpected server error'),
  },
});

export const logoutSubscriptionRoute = createRoute({
  method: 'post',
  path: '/v1/subscriptions/logout',
  operationId: 'logoutSubscription',
  tags: ['Subscription access'],
  summary: 'Clear the subscription session cookie',
  security: subscriptionSecurity,
  responses: {
    204: {
      description: 'Subscription session cleared',
      headers: privateHeaders,
    },
    401: errorResponse('Subscription session is invalid'),
    500: errorResponse('Unexpected server error'),
  },
});

export const getSubscriptionSummaryRoute = createRoute({
  method: 'get',
  path: '/v1/subscriptions/client',
  operationId: 'getSubscriptionSummary',
  tags: ['Subscription access'],
  summary: 'Read the session-bound client and placement summary',
  security: subscriptionSecurity,
  responses: {
    200: {
      description: 'Safe read-only subscription summary',
      content: { 'application/json': { schema: SubscriptionSummarySchema } },
      headers: privateHeaders,
    },
    401: errorResponse('Subscription session is invalid'),
    404: errorResponse('Subscription client does not exist'),
    500: errorResponse('Unexpected server error'),
  },
});

export const getSubscriptionConfigurationRoute = createRoute({
  method: 'get',
  path: '/v1/subscriptions/placements/{placementId}/configuration',
  operationId: 'getSubscriptionConfiguration',
  tags: ['Subscription access'],
  summary: 'Download a session-bound placement configuration live',
  security: subscriptionSecurity,
  request: { params: placementParams },
  responses: {
    200: {
      description: 'Live client configuration attachment',
      content: { 'application/octet-stream': { schema: binaryBody } },
      headers: privateHeaders.extend({
        'Content-Disposition': z.string().min(1),
      }),
    },
    400: errorResponse('Invalid placement identity'),
    401: errorResponse('Subscription session is invalid'),
    404: errorResponse('Placement does not exist for this subscription'),
    409: errorResponse('Placement is unavailable'),
    502: errorResponse('Upstream artifact request failed safely'),
    500: errorResponse('Unexpected server error'),
  },
});

export const getSubscriptionQrCodeRoute = createRoute({
  method: 'get',
  path: '/v1/subscriptions/placements/{placementId}/qrcode.svg',
  operationId: 'getSubscriptionQrCode',
  tags: ['Subscription access'],
  summary: 'Read a session-bound placement QR image live',
  security: subscriptionSecurity,
  request: { params: placementParams },
  responses: {
    200: {
      description: 'Live validated client QR image',
      content: { 'image/svg+xml': { schema: binaryBody } },
      headers: privateHeaders,
    },
    400: errorResponse('Invalid placement identity'),
    401: errorResponse('Subscription session is invalid'),
    404: errorResponse('Placement does not exist for this subscription'),
    409: errorResponse('Placement is unavailable'),
    502: errorResponse('Upstream artifact request failed safely'),
    500: errorResponse('Unexpected server error'),
  },
});
