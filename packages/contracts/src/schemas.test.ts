import { describe, expect, it } from 'vitest';

import {
  CursorQuerySchema,
  ErrorResponseSchema,
  SystemStatusSchema,
} from './schemas';

describe('API schemas', () => {
  it('applies the default bounded page limit', () => {
    expect(CursorQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(() => CursorQuerySchema.parse({ limit: 201 })).toThrow();
  });

  it('accepts the public status shape', () => {
    expect(
      SystemStatusSchema.parse({
        name: 'wg-easy-plane',
        version: '0.0.0',
        apiVersion: 'v1',
        supportedWgEasyVersion: '15.4.0',
      }),
    ).toBeTruthy();
  });

  it('requires request correlation in errors', () => {
    expect(
      ErrorResponseSchema.safeParse({
        error: { code: 'NOT_FOUND', message: 'Not found' },
      }).success,
    ).toBe(false);
  });
});
