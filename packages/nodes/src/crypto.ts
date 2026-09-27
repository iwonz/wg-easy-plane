import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

const KEY_SALT = Buffer.from('wg-easy-plane/nodes/v1', 'utf8');
const CIPHERTEXT_VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export type CredentialField = 'username' | 'password';

function deriveCredentialKey(masterKey: Uint8Array): Uint8Array {
  if (masterKey.byteLength !== 32) {
    throw new Error('Node credential master key must contain 32 bytes');
  }
  return new Uint8Array(
    hkdfSync(
      'sha256',
      masterKey,
      KEY_SALT,
      Buffer.from('node-credentials/aes-256-gcm', 'utf8'),
      32,
    ),
  );
}

function additionalData(nodeId: string, field: CredentialField): Buffer {
  return Buffer.from(`node:${nodeId}:credential:${field}`, 'utf8');
}

function decodePart(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Credential decryption failed');
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) {
    throw new Error('Credential decryption failed');
  }
  return decoded;
}

export class NodeCredentialCipher {
  private readonly key: Uint8Array;

  constructor(
    masterKey: Uint8Array,
    private readonly random: (size: number) => Uint8Array = randomBytes,
  ) {
    this.key = deriveCredentialKey(masterKey);
  }

  encrypt(nodeId: string, field: CredentialField, plaintext: string): string {
    const iv = Buffer.from(this.random(IV_BYTES));
    if (iv.byteLength !== IV_BYTES) {
      throw new Error('Node credential IV source returned an invalid length');
    }
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(additionalData(nodeId, field));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      CIPHERTEXT_VERSION,
      iv.toString('base64url'),
      ciphertext.toString('base64url'),
      tag.toString('base64url'),
    ].join('.');
  }

  decrypt(nodeId: string, field: CredentialField, encoded: string): string {
    try {
      const parts = encoded.split('.');
      if (
        parts.length !== 4 ||
        parts[0] !== CIPHERTEXT_VERSION ||
        !parts[1] ||
        !parts[2] ||
        !parts[3]
      ) {
        throw new Error('invalid ciphertext');
      }
      const iv = decodePart(parts[1]);
      const ciphertext = decodePart(parts[2]);
      const tag = decodePart(parts[3]);
      if (iv.byteLength !== IV_BYTES || tag.byteLength !== TAG_BYTES) {
        throw new Error('invalid ciphertext');
      }
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAAD(additionalData(nodeId, field));
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error('Credential decryption failed');
    }
  }
}
