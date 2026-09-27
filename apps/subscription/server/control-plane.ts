import { loadSubscriptionAppConfig } from '@wg-easy-plane/config';
import type { ErrorCode } from '@wg-easy-plane/contracts';
import type { NextRequest } from 'next/server';

export const SUBSCRIPTION_COOKIE_NAME = 'wgep_subscription';

export const PRIVATE_RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store',
  Pragma: 'no-cache',
  Expires: '0',
  Vary: 'Cookie',
} as const;

const upstreamTimeoutMilliseconds = 10_000;
const safeStatuses = new Set([400, 401, 404, 409, 429]);

export type SafeErrorOptions = {
  status?: number;
  code?: ErrorCode;
  message?: string;
  clearSession?: boolean;
};

export function safeErrorResponse({
  status = 502,
  code = 'UPSTREAM_ERROR',
  message = 'The subscription service is temporarily unavailable',
  clearSession = false,
}: SafeErrorOptions = {}): Response {
  const headers = new Headers({
    ...PRIVATE_RESPONSE_HEADERS,
    'Content-Type': 'application/json',
  });
  if (clearSession) headers.set('Set-Cookie', clearedSessionCookie());
  return Response.json(
    {
      error: {
        code,
        message,
        requestId: crypto.randomUUID(),
      },
    },
    { status, headers },
  );
}

export function mapUpstreamError(response: Response): Response {
  const status = safeStatuses.has(response.status) ? response.status : 502;
  const clearSession = status === 401;
  const code: ErrorCode =
    status === 400
      ? 'VALIDATION_ERROR'
      : status === 401
        ? 'UNAUTHORIZED'
        : status === 404
          ? 'NOT_FOUND'
          : status === 409
            ? 'CONFLICT'
            : status === 429
              ? 'RATE_LIMITED'
              : 'UPSTREAM_ERROR';
  const message =
    status === 401
      ? 'Subscription access is invalid or has been revoked'
      : status === 404
        ? 'The requested subscription resource does not exist'
        : status === 409
          ? 'The requested subscription resource is unavailable'
          : status === 429
            ? 'Too many subscription requests'
            : status === 400
              ? 'The subscription request is invalid'
              : undefined;
  return safeErrorResponse({ status, code, message, clearSession });
}

export function subscriptionCookie(request: NextRequest): string | null {
  const value = request.cookies.get(SUBSCRIPTION_COOKIE_NAME)?.value;
  if (!value || /[;\r\n]/u.test(value)) return null;
  return `${SUBSCRIPTION_COOKIE_NAME}=${value}`;
}

export function copiedSessionCookie(response: Response): string | null {
  const cookies = response.headers.getSetCookie();
  if (cookies.length !== 1) return null;
  const value = cookies[0];
  if (!value || /[\r\n]/u.test(value)) return null;
  const attributes = value.split(';').map((part) => part.trim().toLowerCase());
  if (
    !value.startsWith(`${SUBSCRIPTION_COOKIE_NAME}=`) ||
    !attributes.includes('httponly') ||
    !attributes.includes('secure') ||
    !attributes.includes('samesite=lax') ||
    !attributes.includes('path=/')
  ) {
    return null;
  }
  return value;
}

export function isJsonResponse(response: Response): boolean {
  return (
    response.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase() === 'application/json'
  );
}

export function clearedSessionCookie(): string {
  return `${SUBSCRIPTION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function controlPlaneRequest(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  if (
    !path.startsWith('/api/v1/') ||
    path.includes('?') ||
    path.includes('#')
  ) {
    throw new Error('Invalid fixed control-plane path');
  }
  const { controlPlaneInternalUrl } = loadSubscriptionAppConfig();
  const url = new URL(path, controlPlaneInternalUrl);
  return fetch(url, {
    ...init,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(upstreamTimeoutMilliseconds),
  });
}

export async function authenticatedControlPlaneRequest(
  request: NextRequest,
  path: string,
  init: RequestInit = {},
): Promise<Response | null> {
  const cookie = subscriptionCookie(request);
  if (!cookie) return null;
  const headers = new Headers(init.headers);
  headers.set('Cookie', cookie);
  return controlPlaneRequest(path, { ...init, headers });
}

export function privateResponse(
  body: BodyInit | null,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(PRIVATE_RESPONSE_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(body, { ...init, headers });
}
