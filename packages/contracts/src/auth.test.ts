import { describe, expect, it } from 'vitest';

import {
  LoginRequestSchema,
  SetupRequestSchema,
  SetupStatusSchema,
} from './auth';

describe('authentication contracts', () => {
  it('accepts the documented administrator setup shape', () => {
    expect(
      SetupRequestSchema.parse({
        username: 'panel-admin',
        password: 'synthetic-password-1',
      }),
    ).toEqual({
      username: 'panel-admin',
      password: 'synthetic-password-1',
    });
  });

  it('rejects uppercase usernames and short setup passwords', () => {
    expect(
      SetupRequestSchema.safeParse({ username: 'Admin', password: 'short' })
        .success,
    ).toBe(false);
  });

  it('allows login inputs to be normalized by the domain service', () => {
    expect(
      LoginRequestSchema.parse({
        username: ' PANEL-ADMIN ',
        password: 'synthetic-password-1',
      }).username,
    ).toBe(' PANEL-ADMIN ');
  });

  it('does not expose administrator details in setup status', () => {
    expect(SetupStatusSchema.parse({ setupRequired: true })).toEqual({
      setupRequired: true,
    });
  });
});
