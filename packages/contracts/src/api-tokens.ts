import { createRoute, z } from '@hono/zod-openapi';

import {
  CursorPageSchema,
  CursorQuerySchema,
  ErrorResponseSchema,
  RequestIdHeaderSchema,
} from './schemas';

export const API_TOKEN_SCOPES = [
  'system:read',
  'nodes:read',
  'nodes:write',
  'clients:read',
  'clients:write',
  'subscriptions:read',
  'subscriptions:write',
  'tokens:manage',
] as const;

export const ApiTokenScopeSchema = z
  .enum(API_TOKEN_SCOPES)
  .openapi('ApiTokenScope');
export type ApiTokenScope = z.infer<typeof ApiTokenScopeSchema>;

export const ApiTokenScopesSchema = z
  .array(ApiTokenScopeSchema)
  .min(1)
  .max(API_TOKEN_SCOPES.length)
  .refine((scopes) => new Set(scopes).size === scopes.length, {
    message: 'Scopes must be unique',
  });

export const ApiTokenMetadataSchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1).max(80),
    prefix: z.string().regex(/^wgep_pat_[A-Za-z0-9_-]{8}$/),
    scopes: ApiTokenScopesSchema,
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime().nullable(),
    lastUsedAt: z.iso.datetime().nullable(),
    revokedAt: z.iso.datetime().nullable(),
  })
  .openapi('ApiTokenMetadata');
export type ApiTokenMetadata = z.infer<typeof ApiTokenMetadataSchema>;

export const CreateApiTokenRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    scopes: ApiTokenScopesSchema,
    expiresAt: z.iso.datetime().nullable().optional(),
  })
  .strict()
  .openapi('CreateApiTokenRequest');
export type CreateApiTokenRequest = z.infer<typeof CreateApiTokenRequestSchema>;

export const CreatedApiTokenSchema = z
  .object({
    token: z.string().regex(/^wgep_pat_[A-Za-z0-9_-]{43}$/),
    metadata: ApiTokenMetadataSchema,
  })
  .openapi('CreatedApiToken');

export const ApiTokenListSchema = z
  .object({
    items: z.array(ApiTokenMetadataSchema),
    page: CursorPageSchema,
  })
  .openapi('ApiTokenList');

const jsonRequest = <T extends z.ZodType>(schema: T) => ({
  content: { 'application/json': { schema } },
  required: true as const,
});

const jsonResponse = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
  headers: RequestIdHeaderSchema,
});

const errorResponse = (description: string) =>
  jsonResponse(ErrorResponseSchema, description);

const tokenManagementSecurity: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { bearerAuth: [] },
];

export const listApiTokensRoute = createRoute({
  method: 'get',
  path: '/v1/tokens',
  operationId: 'listApiTokens',
  tags: ['API tokens'],
  summary: 'List safe API token metadata',
  security: tokenManagementSecurity,
  request: { query: CursorQuerySchema },
  responses: {
    200: jsonResponse(ApiTokenListSchema, 'Cursor-paginated token metadata'),
    400: errorResponse('Invalid pagination cursor or limit'),
    401: errorResponse('Authentication is required'),
    403: errorResponse('The credential lacks token-management authority'),
    500: errorResponse('Unexpected server error'),
  },
});

export const createApiTokenRoute = createRoute({
  method: 'post',
  path: '/v1/tokens',
  operationId: 'createApiToken',
  tags: ['API tokens'],
  summary: 'Create an API token and reveal its secret once',
  security: tokenManagementSecurity,
  request: { body: jsonRequest(CreateApiTokenRequestSchema) },
  responses: {
    201: jsonResponse(CreatedApiTokenSchema, 'API token created'),
    400: errorResponse('Invalid API token request'),
    401: errorResponse('Authentication is required'),
    403: errorResponse('Untrusted origin or insufficient scope'),
    500: errorResponse('Unexpected server error'),
  },
});

export const revokeApiTokenRoute = createRoute({
  method: 'delete',
  path: '/v1/tokens/{tokenId}',
  operationId: 'revokeApiToken',
  tags: ['API tokens'],
  summary: 'Revoke an API token',
  security: tokenManagementSecurity,
  request: {
    params: z.object({ tokenId: z.uuid() }),
  },
  responses: {
    204: {
      description: 'Token revoked or already revoked',
      headers: RequestIdHeaderSchema,
    },
    400: errorResponse('Invalid API token identifier'),
    401: errorResponse('Authentication is required'),
    403: errorResponse('Untrusted origin or insufficient scope'),
    404: errorResponse('API token does not exist'),
    500: errorResponse('Unexpected server error'),
  },
});
