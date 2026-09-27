import { OpenAPIHono, z } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import {
  CursorPageSchema,
  CursorQuerySchema,
  type ErrorCode,
  type ErrorResponse,
  systemStatusRoute,
} from '@wg-easy-plane/contracts';

type ApiEnvironment = {
  Variables: {
    requestId: string;
  };
};

const requestIdSchema = z.uuid();

export const openApiDocumentConfig = {
  openapi: '3.1.0' as const,
  info: {
    title: 'WG Easy Plane API',
    version: '0.0.0',
    description: 'Typed API for the WG Easy Plane control plane.',
  },
};

function errorBody(
  requestId: string,
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ErrorResponse {
  return {
    error: {
      code,
      message,
      requestId,
      ...(details === undefined ? {} : { details }),
    },
  };
}

const rootApi = new OpenAPIHono<ApiEnvironment>({
  defaultHook: (result, context) => {
    if (!result.success) {
      return context.json(
        errorBody(
          context.get('requestId'),
          'VALIDATION_ERROR',
          'Request validation failed',
        ),
        400,
      );
    }
  },
});

export const api = rootApi.basePath('/api');

api.openAPIRegistry.register('CursorQuery', CursorQuerySchema);
api.openAPIRegistry.register('CursorPage', CursorPageSchema);
api.openAPIRegistry.registerComponent('securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: 'wgep_access',
});
api.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'wgep_pat_*',
});
api.openAPIRegistry.registerComponent(
  'securitySchemes',
  'subscriptionSession',
  {
    type: 'apiKey',
    in: 'cookie',
    name: 'wgep_subscription',
  },
);

api.use('*', async (context, next) => {
  const candidate = context.req.header('x-request-id');
  const requestId = requestIdSchema.safeParse(candidate).success
    ? (candidate as string)
    : crypto.randomUUID();

  context.set('requestId', requestId);
  await next();
  context.header('X-Request-Id', requestId);
});

api.openapi(systemStatusRoute, (context) =>
  context.json(
    {
      name: 'wg-easy-plane',
      version: '0.0.0',
      apiVersion: 'v1',
      supportedWgEasyVersion: '15.4.0',
    },
    200,
  ),
);

api.doc31('/openapi.json', openApiDocumentConfig);

api.get(
  '/docs',
  Scalar({
    url: '/api/openapi.json',
    pageTitle: 'WG Easy Plane API',
    theme: 'saturn',
  }),
);

api.notFound((context) =>
  context.json(
    errorBody(
      context.get('requestId'),
      'NOT_FOUND',
      'The requested API route does not exist',
    ),
    404,
  ),
);

api.onError((_error, context) =>
  context.json(
    errorBody(
      context.get('requestId'),
      'INTERNAL_ERROR',
      'An unexpected error occurred',
    ),
    500,
  ),
);

export function getOpenApiDocument() {
  return api.getOpenAPI31Document(openApiDocumentConfig);
}
