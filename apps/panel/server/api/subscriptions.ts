import type { OpenAPIHono } from '@hono/zod-openapi';
import {
  SUBSCRIPTION_SESSION_TTL_SECONDS,
  SubscriptionError,
} from '@wg-easy-plane/auth';
import {
  exchangeSubscriptionTokenRoute,
  getSubscriptionConfigurationRoute,
  getSubscriptionLinkRoute,
  getSubscriptionQrCodeRoute,
  getSubscriptionSummaryRoute,
  logoutSubscriptionRoute,
  revokeSubscriptionLinkRoute,
  rotateSubscriptionLinkRoute,
} from '@wg-easy-plane/contracts';
import { SubscriptionReadError } from '@wg-easy-plane/nodes';
import type {
  ConfigurationDelivery,
  QrCodeDelivery,
} from '@wg-easy-plane/nodes';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

import { getPanelSubscriptionRuntime } from '../runtime';
import type { PanelSubscriptionRuntime } from '../runtime';
import { authorizeRequest } from './authorization';
import { errorBody } from './types';
import type { ApiEnvironment } from './types';

export const SUBSCRIPTION_COOKIE_NAME = 'wgep_subscription';

export type SubscriptionApiDependencies = {
  getSubscriptionRuntime?: () => PanelSubscriptionRuntime;
};

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  Pragma: 'no-cache',
  Expires: '0',
} as const;
const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'Lax' as const,
  path: '/',
};

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

function clearSubscriptionCookie(context: Context<ApiEnvironment>): void {
  deleteCookie(context, SUBSCRIPTION_COOKIE_NAME, cookieOptions);
}

async function subscriptionClientId(
  context: Context<ApiEnvironment>,
  runtime: PanelSubscriptionRuntime,
): Promise<string> {
  const principal = await runtime.subscriptionService.authenticateSession(
    getCookie(context, SUBSCRIPTION_COOKIE_NAME),
  );
  return principal.managedClientId;
}

export function registerSubscriptionRoutes(
  api: OpenAPIHono<ApiEnvironment>,
  dependencies: SubscriptionApiDependencies = {},
): void {
  const getRuntime =
    dependencies.getSubscriptionRuntime ?? getPanelSubscriptionRuntime;

  api.use('/v1/clients/managed/*', async (context, next) => {
    await next();
    for (const [name, value] of Object.entries(privateHeaders)) {
      context.header(name, value);
    }
  });
  api.use('/v1/subscriptions/*', async (context, next) => {
    await next();
    for (const [name, value] of Object.entries(privateHeaders)) {
      context.header(name, value);
    }
  });

  api.openapi(getSubscriptionLinkRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, {
      requiredScope: 'subscriptions:read',
    });
    return context.json(
      runtime.subscriptionService.getLink(context.req.valid('param').clientId),
      200,
    );
  });

  api.openapi(rotateSubscriptionLinkRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, {
      requiredScope: 'subscriptions:write',
      mutation: true,
    });
    return context.json(
      runtime.subscriptionService.rotate(context.req.valid('param').clientId),
      200,
    );
  });

  api.openapi(revokeSubscriptionLinkRoute, async (context) => {
    const runtime = getRuntime();
    await authorizeRequest(context, runtime, {
      requiredScope: 'subscriptions:write',
      mutation: true,
    });
    runtime.subscriptionService.revoke(context.req.valid('param').clientId);
    return context.body(null, 204);
  });

  api.openapi(exchangeSubscriptionTokenRoute, async (context) => {
    const runtime = getRuntime();
    const session = await runtime.subscriptionService.exchange(
      context.req.valid('json').token,
    );
    setCookie(context, SUBSCRIPTION_COOKIE_NAME, session.token, {
      ...cookieOptions,
      maxAge: SUBSCRIPTION_SESSION_TTL_SECONDS,
      expires: session.expiresAt,
    });
    return context.json(
      { sessionExpiresAt: session.expiresAt.toISOString() },
      200,
    );
  });

  api.openapi(logoutSubscriptionRoute, async (context) => {
    const runtime = getRuntime();
    await subscriptionClientId(context, runtime);
    clearSubscriptionCookie(context);
    return context.body(null, 204);
  });

  api.openapi(getSubscriptionSummaryRoute, async (context) => {
    const runtime = getRuntime();
    const clientId = await subscriptionClientId(context, runtime);
    return context.json(
      runtime.subscriptionReadService.getSummary(clientId),
      200,
    );
  });

  api.openapi(getSubscriptionConfigurationRoute, async (context) => {
    const runtime = getRuntime();
    const clientId = await subscriptionClientId(context, runtime);
    return configurationResponse(
      await runtime.subscriptionReadService.getConfiguration(
        clientId,
        context.req.valid('param').placementId,
      ),
    );
  });

  api.openapi(getSubscriptionQrCodeRoute, async (context) => {
    const runtime = getRuntime();
    const clientId = await subscriptionClientId(context, runtime);
    return qrResponse(
      await runtime.subscriptionReadService.getQrCode(
        clientId,
        context.req.valid('param').placementId,
      ),
    );
  });
}

export function handleSubscriptionApiError(
  error: Error,
  context: Context<ApiEnvironment>,
): Response | null {
  if (error instanceof SubscriptionError) {
    if (error.code === 'RATE_LIMITED') {
      context.header('Retry-After', String(error.retryAfterSeconds ?? 1));
      return context.json(
        errorBody(
          context.get('requestId'),
          'RATE_LIMITED',
          'Too many subscription exchange attempts',
        ),
        429,
      );
    }
    if (error.code === 'UNAUTHORIZED') {
      clearSubscriptionCookie(context);
      return context.json(
        errorBody(
          context.get('requestId'),
          'UNAUTHORIZED',
          'Subscription authentication is required',
        ),
        401,
      );
    }
    if (error.code === 'INVALID_INPUT') {
      return context.json(
        errorBody(
          context.get('requestId'),
          'VALIDATION_ERROR',
          'Request validation failed',
        ),
        400,
      );
    }
    if (error.code === 'NOT_FOUND') {
      return context.json(
        errorBody(
          context.get('requestId'),
          'NOT_FOUND',
          'Managed client or subscription does not exist',
        ),
        404,
      );
    }
    return context.json(
      errorBody(
        context.get('requestId'),
        'CONFLICT',
        'Subscription access cannot be changed in this state',
      ),
      409,
    );
  }

  if (!(error instanceof SubscriptionReadError)) return null;
  if (error.code === 'INVALID_INPUT') {
    return context.json(
      errorBody(
        context.get('requestId'),
        'VALIDATION_ERROR',
        'Request validation failed',
      ),
      400,
    );
  }
  if (error.code === 'NOT_FOUND') {
    return context.json(
      errorBody(
        context.get('requestId'),
        'NOT_FOUND',
        'Subscription resource does not exist',
      ),
      404,
    );
  }
  if (error.code === 'CONFLICT') {
    return context.json(
      errorBody(
        context.get('requestId'),
        'CONFLICT',
        'Subscription resource is unavailable',
      ),
      409,
    );
  }
  return context.json(
    errorBody(
      context.get('requestId'),
      'UPSTREAM_ERROR',
      'Upstream artifact request failed safely',
    ),
    502,
  );
}
