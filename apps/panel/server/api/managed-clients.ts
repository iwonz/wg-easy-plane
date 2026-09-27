import type { OpenAPIHono } from '@hono/zod-openapi';
import {
  addManagedPlacementRoute,
  cancelAmbiguousPlacementRoute,
  createManagedClientRoute,
  deleteManagedClientRoute,
  disableManagedClientRoute,
  enableManagedClientRoute,
  getManagedClientRoute,
  getPlacementAdvancedRoute,
  linkAmbiguousCandidateRoute,
  listAmbiguousCandidatesRoute,
  listManagedClientsRoute,
  removeManagedPlacementRoute,
  retryManagedPlacementRoute,
  updateManagedClientRoute,
  updatePlacementAdvancedRoute,
} from '@wg-easy-plane/contracts';
import { ManagedClientServiceError } from '@wg-easy-plane/nodes';
import type { Context } from 'hono';

import { getPanelManagedClientRuntime } from '../runtime';
import type { PanelManagedClientRuntime } from '../runtime';
import { authorizeRequest } from './authorization';
import { errorBody } from './types';
import type { ApiEnvironment } from './types';

export type ManagedClientApiDependencies = {
  getManagedClientRuntime?: () => PanelManagedClientRuntime;
};

export function registerManagedClientRoutes(
  api: OpenAPIHono<ApiEnvironment>,
  dependencies: ManagedClientApiDependencies = {},
): void {
  const getRuntime =
    dependencies.getManagedClientRuntime ?? getPanelManagedClientRuntime;

  api.use('/v1/clients/managed*', async (context, next) => {
    await next();
    context.header('Cache-Control', 'private, no-store');
  });

  api.openapi(listManagedClientsRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, { requiredScope: 'clients:read' });
    const page = runtime.managedClientService.list(context.req.valid('query'));
    return context.json(
      { items: page.items, page: { nextCursor: page.nextCursor } },
      200,
    );
  });

  api.openapi(createManagedClientRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, {
      requiredScope: 'clients:write',
      mutation: true,
    });
    return context.json(
      await runtime.managedClientService.create(context.req.valid('json')),
      201,
    );
  });

  api.openapi(getManagedClientRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, { requiredScope: 'clients:read' });
    return context.json(
      runtime.managedClientService.get(context.req.valid('param').clientId),
      200,
    );
  });

  api.openapi(updateManagedClientRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, {
      requiredScope: 'clients:write',
      mutation: true,
    });
    const { clientId } = context.req.valid('param');
    return context.json(
      await runtime.managedClientService.update(
        clientId,
        context.req.valid('json'),
      ),
      200,
    );
  });

  for (const [route, enabled] of [
    [enableManagedClientRoute, true],
    [disableManagedClientRoute, false],
  ] as const) {
    api.openapi(route, async (context) => {
      const runtime = getRuntime();
      await authorizeRequest(context, runtime, {
        requiredScope: 'clients:write',
        mutation: true,
      });
      return context.json(
        await runtime.managedClientService.setEnabled(
          context.req.valid('param').clientId,
          enabled,
        ),
        200,
      );
    });
  }

  api.openapi(deleteManagedClientRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, {
      requiredScope: 'clients:write',
      mutation: true,
    });
    return context.json(
      await runtime.managedClientService.delete(
        context.req.valid('param').clientId,
      ),
      202,
    );
  });

  api.openapi(addManagedPlacementRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, {
      requiredScope: 'clients:write',
      mutation: true,
    });
    const { clientId } = context.req.valid('param');
    return context.json(
      await runtime.managedClientService.addPlacement(
        clientId,
        context.req.valid('json').nodeId,
      ),
      201,
    );
  });

  api.openapi(removeManagedPlacementRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, {
      requiredScope: 'clients:write',
      mutation: true,
    });
    const { clientId, placementId } = context.req.valid('param');
    return context.json(
      await runtime.managedClientService.removePlacement(clientId, placementId),
      200,
    );
  });

  api.openapi(retryManagedPlacementRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, {
      requiredScope: 'clients:write',
      mutation: true,
    });
    const { clientId, placementId } = context.req.valid('param');
    return context.json(
      await runtime.managedClientService.retry(clientId, placementId),
      200,
    );
  });

  api.openapi(getPlacementAdvancedRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, { requiredScope: 'clients:read' });
    const { clientId, placementId } = context.req.valid('param');
    return context.json(
      await runtime.managedClientService.getAdvanced(clientId, placementId),
      200,
    );
  });

  api.openapi(updatePlacementAdvancedRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, {
      requiredScope: 'clients:write',
      mutation: true,
    });
    const { clientId, placementId } = context.req.valid('param');
    return context.json(
      await runtime.managedClientService.updateAdvanced(
        clientId,
        placementId,
        context.req.valid('json'),
      ),
      200,
    );
  });

  api.openapi(listAmbiguousCandidatesRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, { requiredScope: 'clients:read' });
    const { clientId, placementId } = context.req.valid('param');
    return context.json(
      {
        items: runtime.managedClientService.listAmbiguousCandidates(
          clientId,
          placementId,
        ),
      },
      200,
    );
  });

  api.openapi(linkAmbiguousCandidateRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, {
      requiredScope: 'clients:write',
      mutation: true,
    });
    const { clientId, placementId } = context.req.valid('param');
    return context.json(
      await runtime.managedClientService.linkCandidate(
        clientId,
        placementId,
        context.req.valid('json').remoteClientId,
      ),
      200,
    );
  });

  api.openapi(cancelAmbiguousPlacementRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, {
      requiredScope: 'clients:write',
      mutation: true,
    });
    const { clientId, placementId } = context.req.valid('param');
    return context.json(
      runtime.managedClientService.cancelAmbiguous(clientId, placementId),
      200,
    );
  });
}

export function handleManagedClientApiError(
  error: Error,
  context: Context<ApiEnvironment>,
): Response | null {
  if (!(error instanceof ManagedClientServiceError)) return null;
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
        errorBody(
          context.get('requestId'),
          'NOT_FOUND',
          'Managed client, placement, or node does not exist',
        ),
        404,
      );
    case 'CONFLICT':
      return context.json(
        errorBody(
          context.get('requestId'),
          'CONFLICT',
          'The requested lifecycle transition is not safe',
        ),
        409,
      );
  }
}
