import type { OpenAPIHono } from '@hono/zod-openapi';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AuthError,
  REFRESH_TOKEN_TTL_SECONDS,
} from '@wg-easy-plane/auth';
import {
  currentAdminRoute,
  loginRoute,
  logoutRoute,
  refreshRoute,
  setupAdminRoute,
  setupStatusRoute,
} from '@wg-easy-plane/contracts';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

import { getPanelAuthRuntime } from '../runtime';
import type { PanelAuthRuntime } from '../runtime';
import { errorBody } from './types';
import type { ApiEnvironment } from './types';

export const ACCESS_COOKIE_NAME = 'wgep_access';
export const REFRESH_COOKIE_NAME = 'wgep_refresh';

export class OriginError extends Error {
  constructor() {
    super('Untrusted request origin');
    this.name = 'OriginError';
  }
}

export type AuthApiDependencies = {
  getAuthRuntime?: () => PanelAuthRuntime;
};

const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'Lax' as const,
  path: '/',
};

function setSessionCookies(
  context: Context<ApiEnvironment>,
  tokens: {
    accessToken: string;
    refreshToken: string;
    accessExpiresAt: Date;
    refreshExpiresAt: Date;
  },
): void {
  setCookie(context, ACCESS_COOKIE_NAME, tokens.accessToken, {
    ...cookieOptions,
    expires: tokens.accessExpiresAt,
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
  });
  setCookie(context, REFRESH_COOKIE_NAME, tokens.refreshToken, {
    ...cookieOptions,
    expires: tokens.refreshExpiresAt,
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
  });
}

function clearSessionCookies(context: Context<ApiEnvironment>): void {
  deleteCookie(context, ACCESS_COOKIE_NAME, cookieOptions);
  deleteCookie(context, REFRESH_COOKIE_NAME, cookieOptions);
}

export function requireTrustedOrigin(
  context: Context<ApiEnvironment>,
  trustedOrigin: string,
): void {
  const origin = context.req.header('origin');
  if (!origin) throw new OriginError();

  try {
    if (new URL(origin).origin !== trustedOrigin) throw new OriginError();
  } catch (error) {
    if (error instanceof OriginError) throw error;
    throw new OriginError();
  }
}

export function registerAuthRoutes(
  api: OpenAPIHono<ApiEnvironment>,
  dependencies: AuthApiDependencies = {},
): void {
  const getRuntime = dependencies.getAuthRuntime ?? getPanelAuthRuntime;

  api.use('/v1/auth/*', async (context, next) => {
    await next();
    context.header('Cache-Control', 'private, no-store');
  });

  api.openapi(setupStatusRoute, (context) => {
    const { authService } = getRuntime();
    return context.json(authService.getSetupStatus(), 200);
  });

  api.openapi(setupAdminRoute, async (context) => {
    const { authService, trustedOrigin } = getRuntime();
    requireTrustedOrigin(context, trustedOrigin);
    const session = await authService.setup(context.req.valid('json'));
    setSessionCookies(context, session.tokens);
    return context.json({ admin: session.admin }, 201);
  });

  api.openapi(loginRoute, async (context) => {
    const { authService, trustedOrigin } = getRuntime();
    requireTrustedOrigin(context, trustedOrigin);
    const session = await authService.login(context.req.valid('json'));
    setSessionCookies(context, session.tokens);
    return context.json({ admin: session.admin }, 200);
  });

  api.openapi(refreshRoute, async (context) => {
    const { authService, trustedOrigin } = getRuntime();
    requireTrustedOrigin(context, trustedOrigin);
    const tokens = await authService.refresh(
      getCookie(context, REFRESH_COOKIE_NAME),
    );
    setSessionCookies(context, tokens);
    return context.body(null, 204);
  });

  api.openapi(logoutRoute, async (context) => {
    const { authService, trustedOrigin } = getRuntime();
    requireTrustedOrigin(context, trustedOrigin);
    await authService.logout(getCookie(context, REFRESH_COOKIE_NAME));
    clearSessionCookies(context);
    return context.body(null, 204);
  });

  api.openapi(currentAdminRoute, async (context) => {
    const { authService } = getRuntime();
    const admin = await authService.currentAdmin(
      getCookie(context, ACCESS_COOKIE_NAME),
    );
    return context.json({ admin }, 200);
  });
}

export function handleAuthApiError(
  error: Error,
  context: Context<ApiEnvironment>,
): Response | null {
  if (error instanceof OriginError) {
    return context.json(
      errorBody(
        context.get('requestId'),
        'FORBIDDEN',
        'Untrusted request origin',
      ),
      403,
    );
  }
  if (!(error instanceof AuthError)) return null;

  if (error.code === 'RATE_LIMITED') {
    context.header('Retry-After', String(error.retryAfterSeconds ?? 1));
    return context.json(
      errorBody(
        context.get('requestId'),
        'RATE_LIMITED',
        'Too many authentication attempts',
      ),
      429,
    );
  }
  if (error.code === 'SETUP_COMPLETE') {
    return context.json(
      errorBody(
        context.get('requestId'),
        'CONFLICT',
        'Administrator setup is already complete',
      ),
      409,
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

  if (error.code === 'REFRESH_REUSED' || error.code === 'UNAUTHORIZED') {
    clearSessionCookies(context);
  }
  return context.json(
    errorBody(
      context.get('requestId'),
      'UNAUTHORIZED',
      error.code === 'INVALID_CREDENTIALS'
        ? 'Invalid username or password'
        : 'Authentication is required',
    ),
    401,
  );
}
