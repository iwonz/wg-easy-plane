import { describe, expect, it } from 'vitest';

import { DiscoveredClientSchema, SyncRunSummarySchema } from './inventory';

describe('inventory contracts', () => {
  it('accepts safe discovered metadata and rejects undeclared upstream fields', () => {
    const value = {
      nodeId: '00000000-0000-4000-8000-000000000001',
      nodeName: 'Synthetic node',
      nodeMode: 'wireguard',
      nodeStatus: 'healthy',
      remoteClientId: 7,
      publicData: {
        name: 'Synthetic client',
        enabled: true,
        expiresAt: null,
        ipv4Address: '192.0.2.7',
        ipv6Address: '2001:db8::7',
        latestHandshakeAt: null,
        transferRx: 0,
        transferTx: 0,
        createdAt: '2026-01-02T03:04:05.000Z',
        updatedAt: '2026-02-03T04:05:06.000Z',
      },
      upstreamVersion: '15.4.0',
      firstSeenAt: '2026-09-27T10:00:00.000Z',
      lastSeenAt: '2026-09-27T10:01:00.000Z',
      missingAt: null,
    };
    expect(DiscoveredClientSchema.parse(value)).toEqual(value);
    expect(
      DiscoveredClientSchema.safeParse({
        ...value,
        publicData: { ...value.publicData, endpoint: '198.51.100.10:50000' },
      }).success,
    ).toBe(false);
    expect(
      DiscoveredClientSchema.safeParse({
        ...value,
        publicData: { ...value.publicData, oneTimeLink: 'synthetic-link' },
      }).success,
    ).toBe(false);
  });

  it('limits run summaries to stable statuses and safe error codes', () => {
    const value = {
      id: '10000000-0000-4000-8000-000000000001',
      nodeId: '00000000-0000-4000-8000-000000000001',
      status: 'failed',
      seenCount: 0,
      missingCount: 0,
      errorCode: 'TIMEOUT',
      startedAt: '2026-09-27T10:00:00.000Z',
      finishedAt: '2026-09-27T10:00:10.000Z',
    };
    expect(SyncRunSummarySchema.parse(value)).toEqual(value);
    expect(
      SyncRunSummarySchema.safeParse({
        ...value,
        rawBody: 'synthetic upstream body',
      }).success,
    ).toBe(false);
  });
});
