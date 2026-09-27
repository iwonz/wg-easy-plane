import type { NextRequest } from 'next/server';

import {
  authenticatedControlPlaneRequest,
  mapUpstreamError,
  privateResponse,
  safeErrorResponse,
} from '../../../../../server/control-plane';

export const dynamic = 'force-dynamic';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ placementId: string }> },
): Promise<Response> {
  const { placementId } = await params;
  if (!uuidPattern.test(placementId)) {
    return safeErrorResponse({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'The placement identity is invalid',
    });
  }
  try {
    const upstream = await authenticatedControlPlaneRequest(
      request,
      `/api/v1/subscriptions/placements/${placementId}/qrcode.svg`,
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
    const contentType = upstream.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase();
    if (contentType !== 'image/svg+xml') return safeErrorResponse();
    return privateResponse(upstream.body, {
      headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' },
    });
  } catch {
    return safeErrorResponse();
  }
}
