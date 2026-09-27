import { describe, expect, it } from 'vitest';

import {
  SubscriptionExchangeRequestSchema,
  SubscriptionLinkSchema,
  SubscriptionSummarySchema,
} from './subscriptions';

const CLIENT_ID = '10000000-0000-4000-8000-000000000001';
const PLACEMENT_ID = '20000000-0000-4000-8000-000000000001';

describe('subscription contracts', () => {
  it('requires exact fragment-token format', () => {
    expect(
      SubscriptionExchangeRequestSchema.safeParse({
        token: `wgep_sub_${'a'.repeat(43)}`,
      }).success,
    ).toBe(true);
    expect(
      SubscriptionExchangeRequestSchema.safeParse({
        token: `wgep_pat_${'a'.repeat(43)}`,
      }).success,
    ).toBe(false);
  });

  it('represents recoverable links without separate plaintext fields', () => {
    const parsed = SubscriptionLinkSchema.parse({
      clientId: CLIENT_ID,
      status: 'active',
      prefix: 'wgep_sub_abcdefgh',
      url: `https://subscription.example.test/#wgep_sub_${'a'.repeat(43)}`,
      version: 1,
      createdAt: '2026-09-27T10:00:00.000Z',
      rotatedAt: null,
      revokedAt: null,
    });
    expect(parsed).not.toHaveProperty('token');
    expect(parsed).not.toHaveProperty('tokenHash');
    expect(parsed).not.toHaveProperty('tokenCiphertext');
  });

  it('keeps summaries free of remote and node connection details', () => {
    const parsed = SubscriptionSummarySchema.parse({
      clientId: CLIENT_ID,
      name: 'Synthetic subscriber',
      expiresAt: null,
      enabled: true,
      status: 'active',
      placements: [
        {
          id: PLACEMENT_ID,
          nodeName: 'Synthetic node',
          nodeMode: 'wireguard',
          availability: 'available',
        },
      ],
    });
    expect(JSON.stringify(parsed)).not.toMatch(
      /host|port|remoteClientId|desiredPayload|password|configuration|qr/i,
    );
  });
});
