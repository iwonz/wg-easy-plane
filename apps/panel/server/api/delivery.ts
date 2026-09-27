import type { OpenAPIHono } from '@hono/zod-openapi';
import {
  getDiscoveredConfigurationRoute,
  getDiscoveredQrCodeRoute,
  getManagedConfigurationRoute,
  getManagedQrCodeRoute,
} from '@wg-easy-plane/contracts';
import { DeliveryServiceError } from '@wg-easy-plane/nodes';
import type {
  ConfigurationDelivery,
  QrCodeDelivery,
} from '@wg-easy-plane/nodes';
import type { Context } from 'hono';

import { getPanelDeliveryRuntime } from '../runtime';
import type { PanelDeliveryRuntime } from '../runtime';
import { authorizeRequest } from './authorization';
import { errorBody } from './types';
import type { ApiEnvironment } from './types';

export type DeliveryApiDependencies = {
  getDeliveryRuntime?: () => PanelDeliveryRuntime;
};

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

function responseBytes(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function configurationResponse(artifact: ConfigurationDelivery): Response {
  return new Response(responseBytes(artifact.bytes), {
    status: 200,
    headers: {
      ...privateHeaders,
      'Content-Type': artifact.mediaType,
      'Content-Disposition': `attachment; filename="${artifact.filename}"`,
    },
  });
}

function qrResponse(artifact: QrCodeDelivery): Response {
  return new Response(responseBytes(artifact.bytes), {
    status: 200,
    headers: {
      ...privateHeaders,
      'Content-Type': `${artifact.mediaType}; charset=utf-8`,
    },
  });
}

export function registerDeliveryRoutes(
  api: OpenAPIHono<ApiEnvironment>,
  dependencies: DeliveryApiDependencies = {},
): void {
  const getRuntime = dependencies.getDeliveryRuntime ?? getPanelDeliveryRuntime;

  api.use('/v1/clients/*', async (context, next) => {
    await next();
    for (const [name, value] of Object.entries(privateHeaders)) {
      context.header(name, value);
    }
  });

  api.openapi(getManagedConfigurationRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, { requiredScope: 'clients:read' });
    const { clientId, placementId } = context.req.valid('param');
    return configurationResponse(
      await runtime.artifactDeliveryService.getManagedConfiguration(
        clientId,
        placementId,
      ),
    );
  });

  api.openapi(getManagedQrCodeRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, { requiredScope: 'clients:read' });
    const { clientId, placementId } = context.req.valid('param');
    return qrResponse(
      await runtime.artifactDeliveryService.getManagedQrCode(
        clientId,
        placementId,
      ),
    );
  });

  api.openapi(getDiscoveredConfigurationRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, { requiredScope: 'clients:read' });
    const { nodeId, remoteClientId } = context.req.valid('param');
    return configurationResponse(
      await runtime.artifactDeliveryService.getDiscoveredConfiguration(
        nodeId,
        remoteClientId,
      ),
    );
  });

  api.openapi(getDiscoveredQrCodeRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, { requiredScope: 'clients:read' });
    const { nodeId, remoteClientId } = context.req.valid('param');
    return qrResponse(
      await runtime.artifactDeliveryService.getDiscoveredQrCode(
        nodeId,
        remoteClientId,
      ),
    );
  });
}

export function handleDeliveryApiError(
  error: Error,
  context: Context<ApiEnvironment>,
): Response | null {
  if (!(error instanceof DeliveryServiceError)) return null;
  switch (error.code) {
    case 'INVALID_INPUT':
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
          'Client or placement does not exist',
        ),
        404,
      );
    case 'CONFLICT':
      return context.json(
        errorBody(
          context.get('requestId'),
          'CONFLICT',
          'Artifact target is not currently resolvable',
        ),
        409,
      );
    case 'UPSTREAM_ERROR':
      return context.json(
        errorBody(
          context.get('requestId'),
          'UPSTREAM_ERROR',
          'Upstream artifact request failed safely',
        ),
        502,
      );
  }
}
