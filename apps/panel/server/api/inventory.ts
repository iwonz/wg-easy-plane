import type { OpenAPIHono } from '@hono/zod-openapi';
import {
  listDiscoveredClientsRoute,
  syncNodeRoute,
} from '@wg-easy-plane/contracts';
import { InventorySyncError } from '@wg-easy-plane/nodes';
import type { Context } from 'hono';

import { getPanelInventoryRuntime } from '../runtime';
import type { PanelInventoryRuntime } from '../runtime';
import { authorizeRequest } from './authorization';
import { errorBody } from './types';
import type { ApiEnvironment } from './types';

export type InventoryApiDependencies = {
  getInventoryRuntime?: () => PanelInventoryRuntime;
};

export function registerInventoryRoutes(
  api: OpenAPIHono<ApiEnvironment>,
  dependencies: InventoryApiDependencies = {},
): void {
  const getRuntime =
    dependencies.getInventoryRuntime ?? getPanelInventoryRuntime;

  api.use('/v1/clients/discovered*', async (context, next) => {
    await next();
    context.header('Cache-Control', 'private, no-store');
  });

  api.openapi(syncNodeRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, {
      requiredScope: 'nodes:write',
      mutation: true,
    });
    return context.json(
      await runtime.inventorySyncService.syncNode(
        context.req.valid('param').nodeId,
      ),
      200,
    );
  });

  api.openapi(listDiscoveredClientsRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, { requiredScope: 'clients:read' });
    const page = runtime.inventorySyncService.listDiscovered(
      context.req.valid('query'),
    );
    return context.json(
      { items: page.items, page: { nextCursor: page.nextCursor } },
      200,
    );
  });
}

export function handleInventoryApiError(
  error: Error,
  context: Context<ApiEnvironment>,
): Response | null {
  if (!(error instanceof InventorySyncError)) return null;
  switch (error.code) {
    case 'INVALID_INPUT':
    case 'INVALID_CURSOR':
      return context.json(
        errorBody(
          context.get('requestId'),
          'VALIDATION_ERROR',
          'Request validation failed',
        ),
        400,
      );
    case 'NOT_FOUND':
      return context.json(
        errorBody(context.get('requestId'), 'NOT_FOUND', 'Node does not exist'),
        404,
      );
    case 'BUSY':
      return context.json(
        errorBody(
          context.get('requestId'),
          'CONFLICT',
          'Node synchronization is already active',
        ),
        409,
      );
  }
}
