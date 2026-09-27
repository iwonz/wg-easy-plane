import { OpenAPIHono, z } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import {
  CursorPageSchema,
  CursorQuerySchema,
  systemStatusRoute,
} from '@wg-easy-plane/contracts';

import {
  handleAuthApiError,
  registerAuthRoutes,
  type AuthApiDependencies,
} from './auth';
import {
  registerApiTokenRoutes,
  type ApiTokenApiDependencies,
} from './api-tokens';
import { handleAuthorizationError } from './authorization';
import {
  handleNodeApiError,
  registerNodeRoutes,
  type NodeApiDependencies,
} from './nodes';
import { errorBody } from './types';
import type { ApiEnvironment } from './types';

const requestIdSchema = z.uuid();

export const openApiDocumentConfig = {
  openapi: '3.1.0' as const,
  info: {
    title: 'WG Easy Plane API',
    version: '0.0.0',
    description: 'Typed API for the WG Easy Plane control plane.',
  },
};

export type ApiDependencies = AuthApiDependencies &
  ApiTokenApiDependencies &
  NodeApiDependencies;

export function createApi(dependencies: ApiDependencies = {}) {
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
  const api = rootApi.basePath('/api');

  api.openAPIRegistry.register('CursorQuery', CursorQuerySchema);
  api.openAPIRegistry.register('CursorPage', CursorPageSchema);
  api.openAPIRegistry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: 'wgep_access',
  });
  api.openAPIRegistry.registerComponent(
    'securitySchemes',
    'refreshCookieAuth',
    {
      type: 'apiKey',
      in: 'cookie',
      name: 'wgep_refresh',
    },
  );
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
        name: 'wg-easy-plane' as const,
        version: '0.0.0',
        apiVersion: 'v1' as const,
        supportedWgEasyVersion: '15.4.0' as const,
      },
      200,
    ),
  );

  registerAuthRoutes(api, dependencies);
  registerApiTokenRoutes(api, dependencies);
  registerNodeRoutes(api, dependencies);

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

  api.onError((error, context) => {
    const authResponse = handleAuthApiError(error, context);
    if (authResponse) return authResponse;
    const authorizationResponse = handleAuthorizationError(error, context);
    if (authorizationResponse) return authorizationResponse;
    const nodeResponse = handleNodeApiError(error, context);
    if (nodeResponse) return nodeResponse;
    return context.json(
      errorBody(
        context.get('requestId'),
        'INTERNAL_ERROR',
        'An unexpected error occurred',
      ),
      500,
    );
  });

  return api;
}

export const api = createApi();

export function getOpenApiDocument() {
  return api.getOpenAPI31Document(openApiDocumentConfig);
}
