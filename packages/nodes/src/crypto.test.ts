import { describe, expect, it } from 'vitest';

import { NodeCredentialCipher } from './crypto';

describe('NodeCredentialCipher', () => {
  it('round-trips with random IVs and no plaintext in ciphertext', () => {
    let fill = 1;
    const cipher = new NodeCredentialCipher(Buffer.alloc(32, 7), (size) =>
      Buffer.alloc(size, fill++),
    );
    const first = cipher.encrypt(
      '00000000-0000-4000-8000-000000000001',
      'password',
      'synthetic-password',
    );
    const second = cipher.encrypt(
      '00000000-0000-4000-8000-000000000001',
      'password',
      'synthetic-password',
    );

    expect(first).not.toBe(second);
    expect(first).not.toContain('synthetic-password');
    expect(
      cipher.decrypt('00000000-0000-4000-8000-000000000001', 'password', first),
    ).toBe('synthetic-password');
  });

  it('fails closed for a different node, field, key, or tampered value', () => {
    const cipher = new NodeCredentialCipher(Buffer.alloc(32, 7), (size) =>
      Buffer.alloc(size, 3),
    );
    const encoded = cipher.encrypt(
      '00000000-0000-4000-8000-000000000001',
      'username',
      'synthetic-admin',
    );
    const cases = [
      () =>
        cipher.decrypt(
          '00000000-0000-4000-8000-000000000002',
          'username',
          encoded,
        ),
      () =>
        cipher.decrypt(
          '00000000-0000-4000-8000-000000000001',
          'password',
          encoded,
        ),
      () =>
        new NodeCredentialCipher(Buffer.alloc(32, 8)).decrypt(
          '00000000-0000-4000-8000-000000000001',
          'username',
          encoded,
        ),
      () =>
        cipher.decrypt(
          '00000000-0000-4000-8000-000000000001',
          'username',
          `${encoded.slice(0, -1)}x`,
        ),
    ];

    for (const operation of cases) {
      expect(operation).toThrow('Credential decryption failed');
    }
  });
});
