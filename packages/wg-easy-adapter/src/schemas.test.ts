import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  safeClientProjection,
  WgEasyClientCreateRequestSchema,
  WgEasyClientListResponseSchema,
  WgEasyClientUpdateRequestSchema,
  WgEasyInformationResponseSchema,
} from './schemas';

function fixture(name: string): unknown {
  return JSON.parse(
    fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'),
  );
}

describe('wg-easy 15.4.0 schemas', () => {
  it('accepts the synthetic source-derived information and client fixtures', () => {
    expect(
      WgEasyInformationResponseSchema.parse(fixture('information.json')),
    ).toMatchObject({ currentRelease: 'v15.4.0', isAwg: false });
    expect(
      WgEasyClientListResponseSchema.parse(fixture('clients.json')),
    ).toHaveLength(1);
  });

  it('fails closed on unexpected information or client fields', () => {
    const information = fixture('information.json') as Record<string, unknown>;
    expect(
      WgEasyInformationResponseSchema.safeParse({
        ...information,
        unexpected: true,
      }).success,
    ).toBe(false);

    const clients = fixture('clients.json') as Record<string, unknown>[];
    expect(
      WgEasyClientListResponseSchema.safeParse([
        { ...clients[0], unexpected: true },
      ]).success,
    ).toBe(false);
    expect(
      WgEasyClientListResponseSchema.safeParse([clients[0], clients[0]])
        .success,
    ).toBe(false);
  });

  it('projects one-time links and runtime endpoints out of safe clients', () => {
    const [raw] = WgEasyClientListResponseSchema.parse(fixture('clients.json'));
    if (!raw) throw new Error('Missing synthetic client');

    const safe = safeClientProjection(raw);

    expect(safe).not.toHaveProperty('oneTimeLink');
    expect(safe).not.toHaveProperty('endpoint');
    expect(JSON.stringify(safe)).not.toContain('synthetic-one-time-link');
    expect(JSON.stringify(safe)).not.toContain('198.51.100.20');
  });

  it('requires exact create and complete update bodies', () => {
    expect(
      WgEasyClientCreateRequestSchema.safeParse({
        name: 'synthetic-client',
        expiresAt: null,
      }).success,
    ).toBe(true);
    expect(
      WgEasyClientCreateRequestSchema.safeParse({
        name: 'synthetic-client',
        expiresAt: null,
        enabled: true,
      }).success,
    ).toBe(false);

    const [raw] = WgEasyClientListResponseSchema.parse(fixture('clients.json'));
    if (!raw) throw new Error('Missing synthetic client');
    const update = {
      name: raw.name,
      enabled: raw.enabled,
      expiresAt: raw.expiresAt,
      ipv4Address: raw.ipv4Address,
      ipv6Address: raw.ipv6Address,
      preUp: raw.preUp,
      postUp: raw.postUp,
      preDown: raw.preDown,
      postDown: raw.postDown,
      allowedIps: raw.allowedIps,
      serverAllowedIps: raw.serverAllowedIps,
      firewallIps: raw.firewallIps,
      mtu: raw.mtu,
      jC: raw.jC,
      jMin: raw.jMin,
      jMax: raw.jMax,
      i1: raw.i1,
      i2: raw.i2,
      i3: raw.i3,
      i4: raw.i4,
      i5: raw.i5,
      persistentKeepalive: raw.persistentKeepalive,
      serverEndpoint: raw.serverEndpoint,
      dns: raw.dns,
    };

    expect(WgEasyClientUpdateRequestSchema.safeParse(update).success).toBe(
      true,
    );
    expect(
      WgEasyClientUpdateRequestSchema.safeParse({
        ...update,
        preUp: 'first command\nsecond command',
        firewallIps: [
          '192.0.2.0/24',
          '192.0.2.20:443/tcp',
          '[2001:db8::1]:53/udp',
        ],
      }).success,
    ).toBe(true);
    expect(
      WgEasyClientUpdateRequestSchema.safeParse({
        ...update,
        firewallIps: ['not-an-address:443/tcp'],
      }).success,
    ).toBe(false);
    const incomplete: Partial<typeof update> = { ...update };
    delete incomplete.mtu;
    expect(WgEasyClientUpdateRequestSchema.safeParse(incomplete).success).toBe(
      false,
    );
  });
});
