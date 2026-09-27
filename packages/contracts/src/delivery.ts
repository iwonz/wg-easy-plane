import { createRoute, z } from '@hono/zod-openapi';

import { ErrorResponseSchema, RequestIdHeaderSchema } from './schemas';

const binaryBody = z.string().openapi({ format: 'binary' });
const security: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { bearerAuth: [] },
];
const managedParams = z.object({
  clientId: z.uuid(),
  placementId: z.uuid(),
});
const discoveredParams = z.object({
  nodeId: z.uuid(),
  remoteClientId: z.coerce.number().int().positive(),
});
const responseHeaders = RequestIdHeaderSchema.extend({
  'Cache-Control': z.literal('private, no-store'),
  Pragma: z.literal('no-cache'),
  Expires: z.literal('0'),
});
const configurationHeaders = responseHeaders.extend({
  'Content-Disposition': z.string().min(1),
});
const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorResponseSchema } },
  headers: RequestIdHeaderSchema,
});
const commonErrors = {
  400: errorResponse('Invalid artifact target'),
  401: errorResponse('Authentication is required'),
  403: errorResponse('Insufficient scope'),
  404: errorResponse('Client or placement does not exist'),
  409: errorResponse('Artifact target is not currently resolvable'),
  502: errorResponse('Upstream artifact request failed safely'),
  500: errorResponse('Unexpected server error'),
} as const;

function configurationRoute<
  TParams extends typeof managedParams | typeof discoveredParams,
>(options: {
  path: string;
  operationId: string;
  summary: string;
  request: { params: TParams };
}) {
  return createRoute({
    method: 'get',
    path: options.path,
    operationId: options.operationId,
    tags: ['Delivery'],
    summary: options.summary,
    security,
    request: options.request,
    responses: {
      200: {
        description: 'Live client configuration attachment',
        content: { 'application/octet-stream': { schema: binaryBody } },
        headers: configurationHeaders,
      },
      ...commonErrors,
    },
  });
}

function qrRoute<
  TParams extends typeof managedParams | typeof discoveredParams,
>(options: {
  path: string;
  operationId: string;
  summary: string;
  request: { params: TParams };
}) {
  return createRoute({
    method: 'get',
    path: options.path,
    operationId: options.operationId,
    tags: ['Delivery'],
    summary: options.summary,
    security,
    request: options.request,
    responses: {
      200: {
        description: 'Live validated client QR image',
        content: { 'image/svg+xml': { schema: binaryBody } },
        headers: responseHeaders,
      },
      ...commonErrors,
    },
  });
}

export const getManagedConfigurationRoute = configurationRoute({
  path: '/v1/clients/managed/{clientId}/placements/{placementId}/configuration',
  operationId: 'getManagedConfiguration',
  summary: 'Download a managed placement configuration live',
  request: { params: managedParams },
});

export const getManagedQrCodeRoute = qrRoute({
  path: '/v1/clients/managed/{clientId}/placements/{placementId}/qrcode.svg',
  operationId: 'getManagedQrCode',
  summary: 'Read a managed placement QR image live',
  request: { params: managedParams },
});

export const getDiscoveredConfigurationRoute = configurationRoute({
  path: '/v1/clients/discovered/{nodeId}/{remoteClientId}/configuration',
  operationId: 'getDiscoveredConfiguration',
  summary: 'Download a discovered client configuration live',
  request: { params: discoveredParams },
});

export const getDiscoveredQrCodeRoute = qrRoute({
  path: '/v1/clients/discovered/{nodeId}/{remoteClientId}/qrcode.svg',
  operationId: 'getDiscoveredQrCode',
  summary: 'Read a discovered client QR image live',
  request: { params: discoveredParams },
});
