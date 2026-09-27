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
      '/api/v1/clients/managed/{clientId}',
      '/api/v1/clients/managed/{clientId}/placements/{placementId}/retry',
      '/api/v1/clients/managed/{clientId}/placements/{placementId}/link',
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
});
