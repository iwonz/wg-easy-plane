import { describe, expect, it } from 'vitest';

import {
  CreateManagedClientRequestSchema,
  ManagedClientSchema,
  UpdateManagedClientRequestSchema,
} from './managed-clients';

const NODE_ID = '10000000-0000-4000-8000-000000000001';

describe('managed client contracts', () => {
  it('requires distinct node identities and at least one shared update', () => {
    expect(
      CreateManagedClientRequestSchema.safeParse({
        name: 'Synthetic',
        nodeIds: [NODE_ID, NODE_ID],
      }).success,
    ).toBe(false);
    expect(UpdateManagedClientRequestSchema.safeParse({}).success).toBe(false);
    expect(
      UpdateManagedClientRequestSchema.safeParse({ expiresAt: null }).success,
    ).toBe(true);
  });

  it('keeps placement responses free of node endpoints and desired payloads', () => {
    const parsed = ManagedClientSchema.parse({
      id: '20000000-0000-4000-8000-000000000001',
      name: 'Synthetic',
      expiresAt: null,
      enabled: true,
      lifecycleStatus: 'active',
      placements: [
        {
          id: '30000000-0000-4000-8000-000000000001',
          nodeId: NODE_ID,
          nodeName: 'Synthetic node',
          nodeMode: 'wireguard',
          remoteClientId: 7,
          status: 'active',
          lastErrorCode: null,
          desiredHydrated: true,
          lastAttemptAt: null,
          createdAt: '2026-09-27T10:00:00.000Z',
          updatedAt: '2026-09-27T10:00:00.000Z',
        },
      ],
      createdAt: '2026-09-27T10:00:00.000Z',
      updatedAt: '2026-09-27T10:00:00.000Z',
    });
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain('host');
    expect(serialized).not.toContain('desiredPayload');
    expect(serialized).not.toContain('password');
  });
});
