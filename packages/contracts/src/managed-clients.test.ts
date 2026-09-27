import { describe, expect, it } from 'vitest';

import {
  AdoptManagedClientRequestSchema,
  CreateManagedClientRequestSchema,
  ManagedClientSchema,
  PlacementAdvancedStateSchema,
  PlacementAdvancedValuesSchema,
  PlacementDriftStateSchema,
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

  it('accepts only the pinned safe advanced contract', () => {
    const values = {
      ipv4Address: '192.0.2.7',
      ipv6Address: '2001:db8::7',
      preUp: '',
      postUp: '',
      preDown: '',
      postDown: '',
      allowedIps: null,
      serverAllowedIps: ['0.0.0.0/0', '::/0'],
      firewallIps: ['192.0.2.7:443/tcp'],
      mtu: 1420,
      jC: 5,
      jMin: 10,
      jMax: 20,
      i1: '<b 0x10>',
      i2: null,
      i3: null,
      i4: null,
      i5: '<c 0x20>',
      persistentKeepalive: 25,
      serverEndpoint: null,
      dns: ['192.0.2.53'],
    };
    expect(PlacementAdvancedValuesSchema.parse(values)).toEqual(values);
    expect(
      PlacementAdvancedValuesSchema.safeParse({
        ...values,
        ContentPaddingAddition: 32,
      }).success,
    ).toBe(false);

    const state = PlacementAdvancedStateSchema.parse({
      clientId: '20000000-0000-4000-8000-000000000001',
      placementId: '30000000-0000-4000-8000-000000000001',
      nodeId: NODE_ID,
      nodeName: 'Synthetic node',
      nodeMode: 'amnezia',
      status: 'active',
      supportedAwgGeneration: 'legacy',
      values,
    });
    expect(JSON.stringify(state)).not.toMatch(
      /publicKey|privateKey|presharedKey|configuration|qr/i,
    );
  });

  it('requires one explicit adoption candidate per node', () => {
    const request = {
      name: 'Adopted synthetic',
      expiresAt: null,
      enabled: true,
      selections: [{ nodeId: NODE_ID, remoteClientId: 7 }],
    };
    expect(AdoptManagedClientRequestSchema.parse(request)).toEqual(request);
    expect(
      AdoptManagedClientRequestSchema.safeParse({
        ...request,
        selections: [
          ...request.selections,
          { nodeId: NODE_ID, remoteClientId: 8 },
        ],
      }).success,
    ).toBe(false);
  });

  it('represents only safe exact drift values and nullable remote state', () => {
    const mutable = {
      name: 'Synthetic',
      enabled: true,
      expiresAt: null,
      ipv4Address: '192.0.2.7',
      ipv6Address: '2001:db8::7',
      preUp: '',
      postUp: '',
      preDown: '',
      postDown: '',
      allowedIps: null,
      serverAllowedIps: [],
      firewallIps: null,
      mtu: 1420,
      jC: null,
      jMin: null,
      jMax: null,
      i1: null,
      i2: null,
      i3: null,
      i4: null,
      i5: null,
      persistentKeepalive: 25,
      serverEndpoint: null,
      dns: ['192.0.2.53'],
    };
    const parsed = PlacementDriftStateSchema.parse({
      clientId: '20000000-0000-4000-8000-000000000001',
      placementId: '30000000-0000-4000-8000-000000000001',
      nodeId: NODE_ID,
      nodeName: 'Synthetic node',
      nodeMode: 'wireguard',
      status: 'missing',
      snapshotAt: '2026-09-27T10:00:00.000Z',
      desired: mutable,
      remote: null,
      differences: [],
    });
    expect(parsed.remote).toBeNull();
    expect(JSON.stringify(parsed)).not.toMatch(
      /publicKey|privateKey|presharedKey|configuration|qr/i,
    );
    expect(
      PlacementDriftStateSchema.safeParse({
        ...parsed,
        differences: [{ field: 'publicKey', desired: 'one', remote: 'two' }],
      }).success,
    ).toBe(false);
  });
});
