import { describe, expect, it } from 'vitest';

import { api } from './app';

describe('panel API', () => {
  it('returns the public system compatibility status', async () => {
    const response = await api.request('/api/v1/system/status');

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    await expect(response.json()).resolves.toEqual({
      name: 'wg-easy-plane',
      version: '0.0.0',
      apiVersion: 'v1',
      supportedWgEasyVersion: '15.4.0',
    });
  });

  it('preserves a caller-supplied UUID request identifier', async () => {
    const requestId = '27bc69d7-5793-4d8a-95ea-9fa01f2f909e';
    const response = await api.request('/api/v1/system/status', {
      headers: { 'X-Request-Id': requestId },
    });

    expect(response.headers.get('x-request-id')).toBe(requestId);
  });

  it('uses the safe error envelope for unknown API routes', async () => {
    const response = await api.request('/api/v1/unknown');
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'The requested API route does not exist',
        requestId: response.headers.get('x-request-id'),
      },
    });
  });

  it('publishes OpenAPI 3.1 with versioned routes and auth schemes', async () => {
    const response = await api.request('/api/openapi.json');
    const document = await response.json();

    expect(response.status).toBe(200);
    expect(document.openapi).toBe('3.1.0');
    expect(document.paths).toHaveProperty('/api/v1/system/status');
    expect(document.components.securitySchemes).toMatchObject({
      cookieAuth: { type: 'apiKey', in: 'cookie' },
      bearerAuth: { type: 'http', scheme: 'bearer' },
      subscriptionSession: { type: 'apiKey', in: 'cookie' },
    });
  });

  it('serves the Scalar API reference', async () => {
    const response = await api.request('/api/docs');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('/api/openapi.json');
  });
});
