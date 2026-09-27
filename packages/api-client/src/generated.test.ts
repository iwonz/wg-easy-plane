import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('generated API client artifacts', () => {
  it('contain the versioned system endpoint', async () => {
    const source = await readFile(
      path.resolve('packages/api-client/src/schema.d.ts'),
      'utf8',
    );

    for (const path of [
      '/api/v1/system/status',
      '/api/v1/auth/setup/status',
      '/api/v1/auth/setup',
      '/api/v1/auth/login',
      '/api/v1/auth/refresh',
      '/api/v1/auth/logout',
      '/api/v1/auth/me',
      '/api/v1/tokens',
      '/api/v1/tokens/{tokenId}',
      '/api/v1/nodes',
      '/api/v1/nodes/test',
      '/api/v1/nodes/{nodeId}',
      '/api/v1/nodes/{nodeId}/test',
      '/api/v1/nodes/{nodeId}/sync',
      '/api/v1/clients/discovered',
      '/api/v1/clients/managed',
      '/api/v1/clients/managed/adopt',
      '/api/v1/clients/managed/{clientId}',
      '/api/v1/clients/managed/{clientId}/placements/{placementId}/retry',
      '/api/v1/clients/managed/{clientId}/placements/{placementId}/drift',
      '/api/v1/clients/managed/{clientId}/placements/{placementId}/accept-remote',
      '/api/v1/clients/managed/{clientId}/placements/{placementId}/reapply-desired',
      '/api/v1/clients/managed/{clientId}/placements/{placementId}/recreate',
      '/api/v1/clients/managed/{clientId}/placements/{placementId}/link',
      '/api/v1/clients/managed/{clientId}/placements/{placementId}/configuration',
      '/api/v1/clients/managed/{clientId}/placements/{placementId}/qrcode.svg',
      '/api/v1/clients/discovered/{nodeId}/{remoteClientId}/configuration',
      '/api/v1/clients/discovered/{nodeId}/{remoteClientId}/qrcode.svg',
    ]) {
      expect(source).toContain(`'${path}'`);
    }
    expect(source).not.toContain('tokenHash');
    expect(source).not.toContain('token_hash');
  });

  it('keeps node credentials out of response metadata', async () => {
    const document = JSON.parse(
      await readFile(path.resolve('packages/api-client/openapi.json'), 'utf8'),
    ) as {
      components: {
        schemas: {
          NodeMetadata: { properties: Record<string, unknown> };
        };
      };
    };
    const properties = document.components.schemas.NodeMetadata.properties;

    expect(properties).not.toHaveProperty('username');
    expect(properties).not.toHaveProperty('password');
    expect(properties).not.toHaveProperty('usernameCiphertext');
    expect(properties).not.toHaveProperty('passwordCiphertext');
  });

  it('keeps upstream secrets and delivery payloads out of discovered clients', async () => {
    const document = JSON.parse(
      await readFile(path.resolve('packages/api-client/openapi.json'), 'utf8'),
    ) as {
      components: {
        schemas: {
          DiscoveredClientPublicData: {
            properties: Record<string, unknown>;
          };
        };
      };
    };
    const properties =
      document.components.schemas.DiscoveredClientPublicData.properties;

    expect(properties).not.toHaveProperty('endpoint');
    expect(properties).not.toHaveProperty('oneTimeLink');
    expect(properties).not.toHaveProperty('configuration');
    expect(properties).not.toHaveProperty('qr');
    expect(properties).not.toHaveProperty('publicKey');
    expect(properties).not.toHaveProperty('serverEndpoint');
  });

  it('keeps desired state and node endpoints out of managed placement metadata', async () => {
    const document = JSON.parse(
      await readFile(path.resolve('packages/api-client/openapi.json'), 'utf8'),
    ) as {
      components: {
        schemas: {
          ManagedPlacement: { properties: Record<string, unknown> };
        };
      };
    };
    const properties = document.components.schemas.ManagedPlacement.properties;

    expect(properties).not.toHaveProperty('desiredPayload');
    expect(properties).not.toHaveProperty('host');
    expect(properties).not.toHaveProperty('password');
    expect(properties).not.toHaveProperty('configuration');
    expect(properties).not.toHaveProperty('qr');
  });

  it('limits drift responses to the pinned mutable contract', async () => {
    const document = JSON.parse(
      await readFile(path.resolve('packages/api-client/openapi.json'), 'utf8'),
    ) as {
      components: {
        schemas: {
          PlacementMutableState: { properties: Record<string, unknown> };
        };
      };
    };
    const properties =
      document.components.schemas.PlacementMutableState.properties;

    expect(properties).toHaveProperty('mtu');
    expect(properties).toHaveProperty('serverEndpoint');
    expect(properties).not.toHaveProperty('publicKey');
    expect(properties).not.toHaveProperty('privateKey');
    expect(properties).not.toHaveProperty('configuration');
    expect(properties).not.toHaveProperty('qr');
  });

  it('documents live delivery as binary private no-store responses', async () => {
    const document = JSON.parse(
      await readFile(path.resolve('packages/api-client/openapi.json'), 'utf8'),
    ) as {
      paths: Record<
        string,
        {
          get: {
            responses: Record<
              string,
              {
                content?: Record<string, { schema: Record<string, unknown> }>;
                headers?: Record<string, { schema?: Record<string, unknown> }>;
              }
            >;
          };
        }
      >;
    };
    const config =
      document.paths[
        '/api/v1/clients/managed/{clientId}/placements/{placementId}/configuration'
      ]?.get.responses['200'];
    const qr =
      document.paths[
        '/api/v1/clients/discovered/{nodeId}/{remoteClientId}/qrcode.svg'
      ]?.get.responses['200'];

    if (!config || !qr) throw new Error('Delivery paths were not generated');
    const configBody = config.content?.['application/octet-stream'];
    const configCacheHeader = config.headers?.['Cache-Control'];
    const qrCacheHeader = qr.headers?.['Cache-Control'];
    if (!configBody || !configCacheHeader || !qrCacheHeader) {
      throw new Error('Delivery response metadata was not generated');
    }

    expect(config.content).toHaveProperty('application/octet-stream');
    expect(configBody.schema).toMatchObject({
      type: 'string',
      format: 'binary',
    });
    expect(configCacheHeader.schema).toMatchObject({
      enum: ['private, no-store'],
    });
    expect(config.headers).toHaveProperty('Content-Disposition');
    expect(qr.content).toHaveProperty('image/svg+xml');
    expect(qrCacheHeader.schema).toMatchObject({
      enum: ['private, no-store'],
    });
  });
});
