import { SubscriptionSummarySchema } from '@wg-easy-plane/contracts';
import type { NextRequest } from 'next/server';

import {
  authenticatedControlPlaneRequest,
  isJsonResponse,
  mapUpstreamError,
  PRIVATE_RESPONSE_HEADERS,
  safeErrorResponse,
} from '../../../server/control-plane';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const upstream = await authenticatedControlPlaneRequest(
      request,
      '/api/v1/subscriptions/client',
    );
    if (!upstream) {
      return safeErrorResponse({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Subscription access is required',
        clearSession: true,
      });
    }
    if (!upstream.ok) return mapUpstreamError(upstream);
    if (!isJsonResponse(upstream)) return safeErrorResponse();
    const body = SubscriptionSummarySchema.safeParse(await upstream.json());
    if (!body.success) return safeErrorResponse();
    return Response.json(body.data, { headers: PRIVATE_RESPONSE_HEADERS });
  } catch {
    return safeErrorResponse();
  }
}
