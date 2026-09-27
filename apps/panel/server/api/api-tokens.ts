import type { OpenAPIHono } from '@hono/zod-openapi';
import {
  createApiTokenRoute,
  listApiTokensRoute,
  revokeApiTokenRoute,
} from '@wg-easy-plane/contracts';

import { getPanelApiTokenRuntime } from '../runtime';
import type { PanelApiTokenRuntime } from '../runtime';
import { authorizeRequest } from './authorization';
import type { ApiEnvironment } from './types';

export type ApiTokenApiDependencies = {
  getApiTokenRuntime?: () => PanelApiTokenRuntime;
};

export function registerApiTokenRoutes(
  api: OpenAPIHono<ApiEnvironment>,
  dependencies: ApiTokenApiDependencies = {},
): void {
  const getRuntime = dependencies.getApiTokenRuntime ?? getPanelApiTokenRuntime;

  api.use('/v1/tokens*', async (context, next) => {
    await next();
    context.header('Cache-Control', 'private, no-store');
  });

  api.openapi(listApiTokensRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, {
      requiredScope: 'tokens:manage',
    });
    const query = context.req.valid('query');
    const page = runtime.apiTokenService.list(query);
    return context.json(
      { items: page.items, page: { nextCursor: page.nextCursor } },
      200,
    );
  });

  api.openapi(createApiTokenRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, {
      requiredScope: 'tokens:manage',
      mutation: true,
    });
    const body = context.req.valid('json');
    const created = runtime.apiTokenService.create({
      name: body.name,
      scopes: body.scopes,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    });
    return context.json(created, 201);
  });

  api.openapi(revokeApiTokenRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, {
      requiredScope: 'tokens:manage',
      mutation: true,
    });
    runtime.apiTokenService.revoke(context.req.valid('param').tokenId);
    return context.body(null, 204);
  });
}
