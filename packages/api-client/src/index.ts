import createClient from 'openapi-fetch';

import type { paths } from './schema';

export type { components, operations, paths } from './schema';

export function createApiClient(options: {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
}) {
  return createClient<paths>({
    baseUrl: options.baseUrl,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
}
