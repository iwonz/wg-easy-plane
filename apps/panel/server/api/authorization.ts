import { ApiTokenError } from '@wg-easy-plane/auth';
import type { ApiTokenScope } from '@wg-easy-plane/contracts';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';

import type { PanelApiTokenRuntime } from '../runtime';
import { ACCESS_COOKIE_NAME, requireTrustedOrigin } from './auth';
import { errorBody } from './types';
import type { ApiEnvironment, RequestPrincipal } from './types';

export class AuthorizationError extends Error {
  constructor(readonly code: 'FORBIDDEN') {
    super('The credential lacks the required scope');
    this.name = 'AuthorizationError';
  }
}

export async function authorizeRequest(
  context: Context<ApiEnvironment>,
  runtime: PanelApiTokenRuntime,
  options: { requiredScope: ApiTokenScope; mutation?: boolean },
): Promise<RequestPrincipal> {
  const authorization = context.req.header('authorization');
  let principal: RequestPrincipal;

  if (authorization !== undefined) {
    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match?.[1]) {
      throw new ApiTokenError('UNAUTHORIZED', 'API token is invalid');
    }
    principal = runtime.apiTokenService.authenticate(match[1]);
    if (!principal.scopes.includes(options.requiredScope)) {
      throw new AuthorizationError('FORBIDDEN');
    }
  } else {
    const admin = await runtime.authService.currentAdmin(
      getCookie(context, ACCESS_COOKIE_NAME),
    );
    if (options.mutation) {
      requireTrustedOrigin(context, runtime.trustedOrigin);
    }
    principal = { kind: 'admin', adminId: admin.id };
  }

  context.set('principal', principal);
  return principal;
}

export function handleAuthorizationError(
  error: Error,
  context: Context<ApiEnvironment>,
): Response | null {
  if (error instanceof AuthorizationError) {
    return context.json(
      errorBody(
        context.get('requestId'),
        'FORBIDDEN',
        'The credential lacks the required scope',
      ),
      403,
    );
  }
  if (!(error instanceof ApiTokenError)) return null;

  if (error.code === 'INVALID_INPUT' || error.code === 'INVALID_CURSOR') {
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
        'API token does not exist',
      ),
      404,
    );
  }
  return context.json(
    errorBody(
      context.get('requestId'),
      'UNAUTHORIZED',
      'Authentication is required',
    ),
    401,
  );
}
