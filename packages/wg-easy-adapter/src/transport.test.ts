import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import { WgEasyAdapterError } from './errors';
import { NodeHttpTransport, transportTestExports } from './transport';

const servers: http.Server[] = [];

async function startServer(
  handler: http.RequestListener,
): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: (server.address() as AddressInfo).port };
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

describe('NodeHttpTransport', () => {
  it('sends bounded requests without exposing host in public state', async () => {
    const { port } = await startServer((request, response) => {
      expect(request.url).toBe('/api/information');
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end('{"ok":true}');
    });
    const transport = new NodeHttpTransport({
      protocol: 'http',
      host: '127.0.0.1',
      port,
    });

    const response = await transport.request({
      operation: 'information',
      method: 'GET',
      path: '/api/information',
    });

    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(response.body)).toBe('{"ok":true}');
    expect(JSON.stringify(transport)).not.toContain('127.0.0.1');
    expect(transport.security).toEqual({
      protocol: 'http',
      allowInsecureTls: false,
    });
  });

  it('blocks redirects without contacting their target', async () => {
    let targetHits = 0;
    const { port } = await startServer((request, response) => {
      if (request.url === '/api/target') targetHits += 1;
      response.statusCode = 302;
      response.setHeader('Location', '/api/target');
      response.end();
    });
    const transport = new NodeHttpTransport({
      protocol: 'http',
      host: '127.0.0.1',
      port,
    });

    await expect(
      transport.request({
        operation: 'information',
        method: 'GET',
        path: '/api/information',
      }),
    ).rejects.toMatchObject({ code: 'REDIRECT_BLOCKED', httpStatus: 302 });
    expect(targetHits).toBe(0);
  });

  it('aborts timeouts and oversized responses with stable safe errors', async () => {
    const timeoutServer = await startServer((_request, response) => {
      setTimeout(() => response.end('late'), 100);
    });
    const timeoutTransport = new NodeHttpTransport({
      protocol: 'http',
      host: '127.0.0.1',
      port: timeoutServer.port,
      timeoutMs: 10,
    });
    await expect(
      timeoutTransport.request({
        operation: 'list_clients',
        method: 'GET',
        path: '/api/client',
      }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });

    const largeServer = await startServer((_request, response) => {
      response.end('0123456789');
    });
    const largeTransport = new NodeHttpTransport({
      protocol: 'http',
      host: '127.0.0.1',
      port: largeServer.port,
      maxResponseBytes: 5,
    });
    await expect(
      largeTransport.request({
        operation: 'list_clients',
        method: 'GET',
        path: '/api/client',
      }),
    ).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
  });

  it('keeps insecure TLS per instance and recognizes certificate failures', () => {
    const trusted = new NodeHttpTransport({
      protocol: 'https',
      host: 'example.test',
      port: 443,
    });
    const insecure = new NodeHttpTransport({
      protocol: 'https',
      host: 'example.test',
      port: 443,
      allowInsecureTls: true,
    });
    const tlsError = Object.assign(new Error('synthetic certificate error'), {
      code: 'DEPTH_ZERO_SELF_SIGNED_CERT',
    });

    expect(trusted.security.allowInsecureTls).toBe(false);
    expect(insecure.security.allowInsecureTls).toBe(true);
    expect(
      transportTestExports.mapNetworkFailure(tlsError, 'information'),
    ).toMatchObject({ code: 'TLS_ERROR', operation: 'information' });
    expect(
      JSON.stringify(
        transportTestExports.mapNetworkFailure(tlsError, 'information'),
      ),
    ).not.toContain('synthetic certificate error');

    const unreachableError = Object.assign(
      new Error('connect to node.example.test failed'),
      { code: 'ECONNREFUSED' },
    );
    const mapped = transportTestExports.mapNetworkFailure(
      unreachableError,
      'information',
    );
    expect(mapped).toMatchObject({
      code: 'UNREACHABLE',
      operation: 'information',
    });
    expect(JSON.stringify(mapped)).not.toContain('node.example.test');
    expect(transportTestExports.requestHostname('[2001:db8::1]')).toBe(
      '2001:db8::1',
    );
  });

  it('rejects non-API paths before network access', async () => {
    const transport = new NodeHttpTransport({
      protocol: 'https',
      host: 'example.test',
      port: 443,
    });

    await expect(
      transport.request({
        operation: 'information',
        method: 'GET',
        path: '/unexpected',
      }),
    ).rejects.toBeInstanceOf(WgEasyAdapterError);
    await expect(
      transport.request({
        operation: 'information',
        method: 'GET',
        path: '/api/../unexpected',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });
});
