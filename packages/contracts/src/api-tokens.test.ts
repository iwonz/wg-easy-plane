import { describe, expect, it } from 'vitest';

import {
  API_TOKEN_SCOPES,
  ApiTokenMetadataSchema,
  CreateApiTokenRequestSchema,
  CreatedApiTokenSchema,
} from './api-tokens';

describe('API token contracts', () => {
  it('keeps the planned fixed scope vocabulary', () => {
    expect(API_TOKEN_SCOPES).toEqual([
      'system:read',
      'nodes:read',
      'nodes:write',
      'clients:read',
      'clients:write',
      'subscriptions:read',
      'subscriptions:write',
      'tokens:manage',
    ]);
  });

  it('rejects repeated or unknown scopes and extra fields', () => {
    expect(
      CreateApiTokenRequestSchema.safeParse({
        name: 'automation',
        scopes: ['nodes:read', 'nodes:read'],
      }).success,
    ).toBe(false);
    expect(
      CreateApiTokenRequestSchema.safeParse({
        name: 'automation',
        scopes: ['everything:write'],
      }).success,
    ).toBe(false);
    expect(
      CreateApiTokenRequestSchema.safeParse({
        name: 'automation',
        scopes: ['nodes:read'],
        secret: 'not-accepted',
      }).success,
    ).toBe(false);
  });

  it('accepts safe metadata without token hashes', () => {
    const metadata = {
      id: '6d86fb21-65e0-4d3e-8809-a055ecd8c2be',
      name: 'Inventory reader',
      prefix: 'wgep_pat_a1B2c3D4',
      scopes: ['nodes:read'],
      createdAt: '2026-09-27T10:00:00.000Z',
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
    };

    expect(ApiTokenMetadataSchema.parse(metadata)).toEqual(metadata);
    expect(
      CreatedApiTokenSchema.safeParse({
        token: `wgep_pat_${'a'.repeat(43)}`,
        metadata,
      }).success,
    ).toBe(true);
  });
});
