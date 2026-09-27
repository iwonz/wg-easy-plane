import type { NextRequest } from 'next/server';

import {
  authenticatedControlPlaneRequest,
  clearedSessionCookie,
  privateResponse,
} from '../../../../server/control-plane';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    await authenticatedControlPlaneRequest(
      request,
      '/api/v1/subscriptions/logout',
      { method: 'POST' },
    );
  } catch {
    // The local session is cleared even if the control plane is unavailable.
  }
  return privateResponse(null, {
    status: 204,
    headers: { 'Set-Cookie': clearedSessionCookie() },
  });
}
