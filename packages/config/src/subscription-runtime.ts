import dotenv from 'dotenv';
import { z } from 'zod';

import { ConfigError } from './runtime';
import type { RuntimeEnvironment } from './runtime';

const internalOrigin = z.url().superRefine((value, context) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return;
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    context.addIssue({ code: 'custom', message: 'must be an HTTP(S) origin' });
  }
});

const subscriptionEnvironmentSchema = z.object({
  CONTROL_PLANE_INTERNAL_URL: internalOrigin,
});

export type SubscriptionAppConfig = {
  controlPlaneInternalUrl: URL;
};

export function parseSubscriptionAppConfig(
  environment: RuntimeEnvironment,
): SubscriptionAppConfig {
  const result = subscriptionEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    throw new ConfigError(['CONTROL_PLANE_INTERNAL_URL']);
  }
  return {
    controlPlaneInternalUrl: new URL(result.data.CONTROL_PLANE_INTERNAL_URL),
  };
}

export function loadSubscriptionAppConfig(): SubscriptionAppConfig {
  dotenv.config({ override: false, quiet: true });
  return parseSubscriptionAppConfig(process.env);
}
