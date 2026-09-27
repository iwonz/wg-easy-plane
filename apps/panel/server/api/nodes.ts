import type { OpenAPIHono } from '@hono/zod-openapi';
import {
  createNodeRoute,
  deleteNodeRoute,
  getNodeRoute,
  listNodesRoute,
  testNodeConnectionRoute,
  testStoredNodeRoute,
  updateNodeRoute,
} from '@wg-easy-plane/contracts';
import { NodeServiceError } from '@wg-easy-plane/nodes';
import type { Context } from 'hono';

import { getPanelNodeRuntime } from '../runtime';
import type { PanelNodeRuntime } from '../runtime';
import { authorizeRequest } from './authorization';
import { errorBody } from './types';
import type { ApiEnvironment } from './types';

export type NodeApiDependencies = {
  getNodeRuntime?: () => PanelNodeRuntime;
};

export function registerNodeRoutes(
  api: OpenAPIHono<ApiEnvironment>,
  dependencies: NodeApiDependencies = {},
): void {
  const getRuntime = dependencies.getNodeRuntime ?? getPanelNodeRuntime;

  api.use('/v1/nodes*', async (context, next) => {
    await next();
    context.header('Cache-Control', 'private, no-store');
  });

  api.openapi(listNodesRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, { requiredScope: 'nodes:read' });
    const page = runtime.nodeService.list(context.req.valid('query'));
    return context.json(
      { items: page.items, page: { nextCursor: page.nextCursor } },
      200,
    );
  });

  api.openapi(createNodeRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, {
      requiredScope: 'nodes:write',
      mutation: true,
    });
    const node = await runtime.nodeService.create(context.req.valid('json'));
    if (node.status === 'healthy' && runtime.inventorySyncService) {
      try {
        await runtime.inventorySyncService.syncNode(node.id);
      } catch {
        // The node remains registered and the sync run stores a safe failure.
      }
    }
    return context.json(runtime.nodeService.get(node.id), 201);
  });

  api.openapi(testNodeConnectionRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, {
      requiredScope: 'nodes:write',
      mutation: true,
    });
    return context.json(
      await runtime.nodeService.testConnection(context.req.valid('json')),
      200,
    );
  });

  api.openapi(getNodeRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, { requiredScope: 'nodes:read' });
    return context.json(
      runtime.nodeService.get(context.req.valid('param').nodeId),
      200,
    );
  });

  api.openapi(updateNodeRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, {
      requiredScope: 'nodes:write',
      mutation: true,
    });
    return context.json(
      await runtime.nodeService.update(
        context.req.valid('param').nodeId,
        context.req.valid('json'),
      ),
      200,
    );
  });

  api.openapi(testStoredNodeRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, {
      requiredScope: 'nodes:write',
      mutation: true,
    });
    return context.json(
      await runtime.nodeService.retest(context.req.valid('param').nodeId),
      200,
    );
  });

  api.openapi(deleteNodeRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, {
      requiredScope: 'nodes:write',
      mutation: true,
    });
    runtime.nodeService.delete(context.req.valid('param').nodeId);
    return context.body(null, 204);
  });
}

export function handleNodeApiError(
  error: Error,
  context: Context<ApiEnvironment>,
): Response | null {
  if (!(error instanceof NodeServiceError)) return null;
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
    case 'CONFLICT':
      return context.json(
        errorBody(
          context.get('requestId'),
          'CONFLICT',
          'Node name or endpoint already exists',
        ),
        409,
      );
    case 'HAS_PLACEMENTS':
      return context.json(
        errorBody(
          context.get('requestId'),
          'CONFLICT',
          'Node has managed placements',
        ),
        409,
      );
  }
}
