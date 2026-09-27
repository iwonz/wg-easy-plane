import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import { WgEasyAdapter, adapterTestExports } from './adapter';
import { WgEasyAdapterError } from './errors';
import {
  WgEasyClientListResponseSchema,
  type WgEasyClientUpdateRequest,
} from './schemas';
import type {
  WgEasyTransport,
  WgEasyTransportRequest,
  WgEasyTransportResponse,
} from './transport';

function fixture(name: string): unknown {
  return JSON.parse(
    fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'),
  );
}

function jsonResponse(body: unknown, status = 200): WgEasyTransportResponse {
  return {
    status,
    contentType: 'application/json; charset=utf-8',
    body: Buffer.from(JSON.stringify(body), 'utf8'),
  };
}

class FakeTransport implements WgEasyTransport {
  readonly requests: WgEasyTransportRequest[] = [];
  readonly responses: WgEasyTransportResponse[] = [];

  enqueue(...responses: WgEasyTransportResponse[]): void {
    this.responses.push(...responses);
  }

  async request(
    input: WgEasyTransportRequest,
  ): Promise<WgEasyTransportResponse> {
    this.requests.push(input);
    const response = this.responses.shift();
    if (!response) throw new Error('Missing synthetic response');
    return response;
  }
}

function createFixture() {
  const transport = new FakeTransport();
  const adapter = new WgEasyAdapter(
    {
      protocol: 'https',
      host: 'node.example.test',
      port: 51821,
      username: 'synthetic-admin',
      password: 'synthetic-password',
    },
    { transport },
  );
  return { adapter, transport };
}

function updatePayload(): WgEasyClientUpdateRequest {
  const [client] = WgEasyClientListResponseSchema.parse(
    fixture('clients.json'),
  );
  if (!client) throw new Error('Missing synthetic client');
  return {
    name: client.name,
    enabled: client.enabled,
    expiresAt: client.expiresAt,
    ipv4Address: client.ipv4Address,
    ipv6Address: client.ipv6Address,
    preUp: client.preUp,
    postUp: client.postUp,
    preDown: client.preDown,
    postDown: client.postDown,
    allowedIps: client.allowedIps,
    serverAllowedIps: client.serverAllowedIps,
    firewallIps: client.firewallIps,
    mtu: client.mtu,
    jC: client.jC,
    jMin: client.jMin,
    jMax: client.jMax,
    i1: client.i1,
    i2: client.i2,
    i3: client.i3,
    i4: client.i4,
    i5: client.i5,
    persistentKeepalive: client.persistentKeepalive,
    serverEndpoint: client.serverEndpoint,
    dns: client.dns,
  };
}

describe('WgEasyAdapter', () => {
  it('probes exactly 15.4.0, detects mode, and returns a safe inventory', async () => {
    const { adapter, transport } = createFixture();
    const information = {
      ...(fixture('information.json') as Record<string, unknown>),
      isAwg: true,
    };
    transport.enqueue(
      jsonResponse(information),
      jsonResponse(fixture('clients.json')),
    );

    const result = await adapter.probe();

    expect(result.information).toEqual({
      version: '15.4.0',
      mode: 'amnezia',
      upstreamInsecure: false,
      firewallEnabled: true,
      updateAvailable: false,
    });
    expect(result.clients).toHaveLength(1);
    expect(result.clients[0]).not.toHaveProperty('oneTimeLink');
    expect(result.clients[0]).not.toHaveProperty('endpoint');
    expect(transport.requests.map((request) => request.path)).toEqual([
      '/api/information',
      '/api/client',
    ]);
    expect(transport.requests[0]?.headers?.Authorization).toBeUndefined();
    const authorization = transport.requests[1]?.headers?.Authorization;
    expect(authorization).toMatch(/^Basic /);
    expect(
      Buffer.from(
        authorization?.slice('Basic '.length) ?? '',
        'base64',
      ).toString('utf8'),
    ).toBe('synthetic-admin:synthetic-password');
    const serialized = JSON.stringify(adapter);
    expect(serialized).not.toContain('node.example.test');
    expect(serialized).not.toContain('synthetic-admin');
    expect(serialized).not.toContain('synthetic-password');
  });

  it('blocks unsupported and malformed information before mutation', async () => {
    const unsupported = createFixture();
    unsupported.transport.enqueue(
      jsonResponse({
        ...(fixture('information.json') as Record<string, unknown>),
        currentRelease: 'v15.5.0',
      }),
    );

    await expect(
      unsupported.adapter.createClient({
        name: 'synthetic-client',
        expiresAt: null,
      }),
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED_VERSION',
      detectedVersion: '15.5.0',
    });
    expect(unsupported.transport.requests).toHaveLength(1);

    const malformed = createFixture();
    malformed.transport.enqueue(
      jsonResponse({
        ...(fixture('information.json') as Record<string, unknown>),
        unexpected: true,
      }),
    );
    await expect(malformed.adapter.getInformation()).rejects.toMatchObject({
      code: 'API_INCOMPATIBLE',
      operation: 'information',
    });
  });

  it.each(['invalid credentials', '2FA rejection'])(
    'maps %s to the same safe auth failure',
    async () => {
      const { adapter, transport } = createFixture();
      transport.enqueue(
        jsonResponse(fixture('information.json')),
        jsonResponse({ arbitrary: 'upstream detail' }, 401),
      );

      await expect(adapter.listClients()).rejects.toMatchObject({
        code: 'AUTH_FAILED',
        operation: 'list_clients',
        httpStatus: 401,
      });
    },
  );

  it('rejects a malformed inventory without returning a partial list', async () => {
    const { adapter, transport } = createFixture();
    const clients = fixture('clients.json') as Record<string, unknown>[];
    transport.enqueue(
      jsonResponse(fixture('information.json')),
      jsonResponse([clients[0], { ...clients[0], unexpected: true }]),
    );

    await expect(adapter.listClients()).rejects.toMatchObject({
      code: 'API_INCOMPATIBLE',
      operation: 'list_clients',
    });
  });

  it('sends exact create, update, toggle, and delete requests after one gate', async () => {
    const { adapter, transport } = createFixture();
    transport.enqueue(
      jsonResponse(fixture('information.json')),
      jsonResponse({ success: true, clientId: 7 }, 201),
      jsonResponse({ success: true }),
      jsonResponse({ success: true }),
      jsonResponse({ success: true }),
      jsonResponse({ success: true }),
      jsonResponse({ arbitrary: 'missing client detail' }, 404),
    );

    await adapter.getInformation();
    await expect(
      adapter.createClient({ name: 'synthetic-client', expiresAt: null }),
    ).resolves.toBe(7);
    const update = updatePayload();
    await adapter.updateClient(7, update);
    await adapter.enableClient(7);
    await adapter.disableClient(7);
    await expect(adapter.deleteClient(7)).resolves.toBe('deleted');
    await expect(adapter.deleteClient(8)).resolves.toBe('not_found');

    expect(
      transport.requests.map((request) => [request.method, request.path]),
    ).toEqual([
      ['GET', '/api/information'],
      ['POST', '/api/client'],
      ['POST', '/api/client/7'],
      ['POST', '/api/client/7/enable'],
      ['POST', '/api/client/7/disable'],
      ['DELETE', '/api/client/7'],
      ['DELETE', '/api/client/8'],
    ]);
    expect(
      JSON.parse(
        new TextDecoder().decode(transport.requests[1]?.body),
      ) as unknown,
    ).toEqual({ name: 'synthetic-client', expiresAt: null });
    expect(
      JSON.parse(
        new TextDecoder().decode(transport.requests[2]?.body),
      ) as unknown,
    ).toEqual(update);
  });

  it('rejects invalid mutations locally without contacting the node', async () => {
    const { adapter, transport } = createFixture();

    await expect(
      adapter.createClient({ name: '', expiresAt: null }),
    ).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      operation: 'create_client',
    });
    await expect(adapter.enableClient(0)).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      operation: 'enable_client',
    });
    expect(transport.requests).toHaveLength(0);
  });

  it('returns bounded live artifacts and fails closed on unsafe SVG', async () => {
    const { adapter, transport } = createFixture();
    const configBytes = Buffer.from('synthetic-live-artifact', 'utf8');
    const svgBytes = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>',
      'utf8',
    );
    transport.enqueue(
      jsonResponse(fixture('information.json')),
      {
        status: 200,
        contentType: 'application/octet-stream',
        body: configBytes,
      },
      { status: 200, contentType: 'image/svg+xml', body: svgBytes },
      {
        status: 200,
        contentType: 'image/svg+xml',
        body: Buffer.from('<svg><script>unsafe()</script></svg>', 'utf8'),
      },
    );

    const configuration = await adapter.getConfiguration(7);
    const qr = await adapter.getQrCode(7);
    expect(new TextDecoder().decode(configuration.bytes)).toBe(
      'synthetic-live-artifact',
    );
    expect(qr.mediaType).toBe('image/svg+xml');
    expect(JSON.stringify(adapter)).not.toContain('synthetic-live-artifact');
    await expect(adapter.getQrCode(7)).rejects.toMatchObject({
      code: 'API_INCOMPATIBLE',
      operation: 'qr_code',
    });
  });

  it('sanitizes upstream errors and unsafe SVG checks', async () => {
    const { adapter, transport } = createFixture();
    transport.enqueue(
      jsonResponse(
        {
          message:
            'synthetic-sensitive-upstream-body with node.example.test and credentials',
        },
        500,
      ),
    );

    let caught: unknown;
    try {
      await adapter.getInformation();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WgEasyAdapterError);
    const serialized = JSON.stringify(caught);
    expect(serialized).not.toContain('synthetic-sensitive-upstream-body');
    expect(serialized).not.toContain('node.example.test');
    expect(serialized).not.toContain('synthetic-password');
    expect(serialized).toContain('UPSTREAM_ERROR');

    expect(() =>
      adapterTestExports.assertSafeSvg(
        Buffer.from('<!DOCTYPE svg><svg/>', 'utf8'),
        'qr_code',
        200,
      ),
    ).toThrowError(WgEasyAdapterError);
  });
});
