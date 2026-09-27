import {
  SubscriptionExchangeRequestSchema,
  SubscriptionExchangeResponseSchema,
} from '@wg-easy-plane/contracts';

import {
  controlPlaneRequest,
  copiedSessionCookie,
  isJsonResponse,
  mapUpstreamError,
  PRIVATE_RESPONSE_HEADERS,
  safeErrorResponse,
} from '../../../../server/control-plane';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return safeErrorResponse({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'The subscription token is invalid',
    });
  }
  const parsedRequest = SubscriptionExchangeRequestSchema.safeParse(payload);
  if (!parsedRequest.success) {
    return safeErrorResponse({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'The subscription token is invalid',
    });
  }

  try {
    const upstream = await controlPlaneRequest(
      '/api/v1/subscriptions/exchange',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedRequest.data),
      },
    );
    if (!upstream.ok) return mapUpstreamError(upstream);
    if (!isJsonResponse(upstream)) return safeErrorResponse();
    const body = SubscriptionExchangeResponseSchema.safeParse(
      await upstream.json(),
    );
    const cookie = copiedSessionCookie(upstream);
    if (!body.success || !cookie) return safeErrorResponse();
    return Response.json(body.data, {
      headers: {
        ...PRIVATE_RESPONSE_HEADERS,
        'Set-Cookie': cookie,
      },
    });
  } catch {
    return safeErrorResponse();
  }
}
