import { describe, expect, it } from 'vitest';

import {
  CreateNodeRequestSchema,
  NodeMetadataSchema,
  TestNodeConnectionRequestSchema,
  UpdateNodeRequestSchema,
} from './nodes';

describe('node contracts', () => {
  it('accepts synthetic hostname, IPv4, and IPv6 connections', () => {
    for (const host of [
      'node.example.test',
      '192.0.2.10',
      '2001:db8::10',
      '[2001:db8::10]',
    ]) {
      expect(
        TestNodeConnectionRequestSchema.safeParse({
          protocol: 'https',
          host,
          port: 51821,
          username: 'synthetic-admin',
          password: 'synthetic-password',
        }).success,
      ).toBe(true);
    }
  });

  it('rejects hosts with URL, path, credentials, whitespace, or controls', () => {
    for (const host of [
      'https://node.example.test',
      'node.example.test/api',
      'user@node.example.test',
      'node.example.test?query=1',
      'node.example.test#fragment',
      'node example.test',
      'node.example.test\n',
      'bad:host',
      '192.0.2.999',
      '-node.example.test',
    ]) {
      expect(
        CreateNodeRequestSchema.safeParse({
          name: 'Synthetic node',
          protocol: 'https',
          host,
          port: 51821,
          username: 'synthetic-admin',
          password: 'synthetic-password',
        }).success,
      ).toBe(false);
    }
  });

  it('strictly rejects the removed insecure TLS property', () => {
    const connection = {
      protocol: 'https' as const,
      host: 'node.example.test',
      port: 51821,
      username: 'synthetic-admin',
      password: 'synthetic-password',
      allowInsecureTls: false,
    };

    expect(TestNodeConnectionRequestSchema.safeParse(connection).success).toBe(
      false,
    );
    expect(
      CreateNodeRequestSchema.safeParse({
        name: 'Synthetic node',
        ...connection,
      }).success,
    ).toBe(false);
    expect(
      UpdateNodeRequestSchema.safeParse({ allowInsecureTls: false }).success,
    ).toBe(false);
  });

  it('requires a non-empty strict update document', () => {
    expect(UpdateNodeRequestSchema.safeParse({}).success).toBe(false);
    expect(UpdateNodeRequestSchema.safeParse({ name: 'Renamed' }).success).toBe(
      true,
    );
    expect(
      UpdateNodeRequestSchema.safeParse({ name: 'Renamed', extra: true })
        .success,
    ).toBe(false);
  });

  it('keeps credentials and ciphertext out of response metadata', () => {
    const safe = NodeMetadataSchema.parse({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Synthetic node',
      protocol: 'https',
      host: 'node.example.test',
      port: 51821,
      status: 'healthy',
      detectedVersion: '15.4.0',
      mode: 'wireguard',
      lastErrorCode: null,
      lastCheckedAt: '2026-09-27T10:00:00.000Z',
      lastSyncedAt: null,
      createdAt: '2026-09-27T10:00:00.000Z',
      updatedAt: '2026-09-27T10:00:00.000Z',
    });

    expect(safe).not.toHaveProperty('username');
    expect(safe).not.toHaveProperty('password');
    expect(safe).not.toHaveProperty('usernameCiphertext');
    expect(safe).not.toHaveProperty('passwordCiphertext');
    expect(safe).not.toHaveProperty('allowInsecureTls');
  });
});
