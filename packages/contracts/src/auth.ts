import { createRoute, z } from '@hono/zod-openapi';

import { ErrorResponseSchema, RequestIdHeaderSchema } from './schemas';

export const UsernameSchema = z
  .string()
  .regex(/^[a-z0-9._-]{3,64}$/)
  .openapi({
    description: 'Lowercase administrator username',
    example: 'panel-admin',
  });

export const PasswordSchema = z.string().min(12).max(128).openapi({
  description: 'Administrator password; never returned by the API',
});

export const PublicAdminSchema = z
  .object({
    id: z.uuid(),
    username: UsernameSchema,
  })
  .openapi('PublicAdmin');

export type PublicAdmin = z.infer<typeof PublicAdminSchema>;

export const SetupStatusSchema = z
  .object({
    setupRequired: z.boolean(),
  })
  .openapi('SetupStatus');

export const SetupRequestSchema = z
  .object({
    username: UsernameSchema,
    password: PasswordSchema,
  })
  .strict()
  .openapi('SetupRequest');

export const LoginRequestSchema = z
  .object({
    username: z.string().min(1).max(64),
    password: z.string().min(1).max(128),
  })
  .strict()
  .openapi('LoginRequest');

export const AuthenticatedAdminSchema = z
  .object({
    admin: PublicAdminSchema,
  })
  .openapi('AuthenticatedAdmin');

const jsonRequest = <T extends z.ZodType>(schema: T) => ({
  content: {
    'application/json': {
      schema,
    },
  },
  required: true as const,
});

const jsonResponse = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: {
    'application/json': {
      schema,
    },
  },
  headers: RequestIdHeaderSchema,
});

const errorResponse = (description: string) =>
  jsonResponse(ErrorResponseSchema, description);

const RateLimitHeadersSchema = RequestIdHeaderSchema.extend({
  'Retry-After': z.string().openapi({
    description: 'Seconds until another attempt is allowed',
  }),
});

const rateLimitedResponse = {
  description: 'Authentication attempt limit exceeded',
  content: {
    'application/json': {
      schema: ErrorResponseSchema,
    },
  },
  headers: RateLimitHeadersSchema,
};

export const setupStatusRoute = createRoute({
  method: 'get',
  path: '/v1/auth/setup/status',
  operationId: 'getSetupStatus',
  tags: ['Authentication'],
  summary: 'Read first-run setup state',
  responses: {
    200: jsonResponse(SetupStatusSchema, 'Current setup state'),
    500: errorResponse('Unexpected server error'),
  },
});

export const setupAdminRoute = createRoute({
  method: 'post',
  path: '/v1/auth/setup',
  operationId: 'setupAdmin',
  tags: ['Authentication'],
  summary: 'Create the only administrator',
  request: { body: jsonRequest(SetupRequestSchema) },
  responses: {
    201: jsonResponse(AuthenticatedAdminSchema, 'Administrator created'),
    400: errorResponse('Invalid setup request'),
    403: errorResponse('Untrusted request origin'),
    409: errorResponse('Administrator setup is already complete'),
    429: rateLimitedResponse,
    500: errorResponse('Unexpected server error'),
  },
});

export const loginRoute = createRoute({
  method: 'post',
  path: '/v1/auth/login',
  operationId: 'loginAdmin',
  tags: ['Authentication'],
  summary: 'Start an administrator browser session',
  request: { body: jsonRequest(LoginRequestSchema) },
  responses: {
    200: jsonResponse(AuthenticatedAdminSchema, 'Administrator authenticated'),
    400: errorResponse('Invalid login request'),
    401: errorResponse('Invalid username or password'),
    403: errorResponse('Untrusted request origin'),
    429: rateLimitedResponse,
    500: errorResponse('Unexpected server error'),
  },
});

export const refreshRoute = createRoute({
  method: 'post',
  path: '/v1/auth/refresh',
  operationId: 'refreshAdminSession',
  tags: ['Authentication'],
  summary: 'Rotate the administrator refresh session',
  security: [{ refreshCookieAuth: [] }],
  responses: {
    204: {
      description: 'Session rotated',
      headers: RequestIdHeaderSchema,
    },
    401: errorResponse('Refresh session is invalid or has been reused'),
    403: errorResponse('Untrusted request origin'),
    429: rateLimitedResponse,
    500: errorResponse('Unexpected server error'),
  },
});

export const logoutRoute = createRoute({
  method: 'post',
  path: '/v1/auth/logout',
  operationId: 'logoutAdmin',
  tags: ['Authentication'],
  summary: 'End the administrator browser session',
  security: [{ refreshCookieAuth: [] }],
  responses: {
    204: {
      description: 'Cookies cleared and identifiable session revoked',
      headers: RequestIdHeaderSchema,
    },
    403: errorResponse('Untrusted request origin'),
    500: errorResponse('Unexpected server error'),
  },
});

export const currentAdminRoute = createRoute({
  method: 'get',
  path: '/v1/auth/me',
  operationId: 'getCurrentAdmin',
  tags: ['Authentication'],
  summary: 'Read the authenticated administrator',
  security: [{ cookieAuth: [] }],
  responses: {
    200: jsonResponse(AuthenticatedAdminSchema, 'Current administrator'),
    401: errorResponse('Authentication is required'),
    500: errorResponse('Unexpected server error'),
  },
});
