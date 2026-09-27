import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

export type RuntimeEnvironment = Record<string, string | undefined>;

export class ConfigError extends Error {
  readonly variables: string[];

  constructor(variables: string[]) {
    super(`Invalid runtime configuration: ${variables.join(', ')}`);
    this.name = 'ConfigError';
    this.variables = variables;
  }
}

const encryptionKey = z.string().superRefine((value, context) => {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    context.addIssue({ code: 'custom', message: 'must be base64' });
    return;
  }

  if (Buffer.from(value, 'base64').byteLength !== 32) {
    context.addIssue({ code: 'custom', message: 'must decode to 32 bytes' });
  }
});

const positiveInteger = z.coerce.number().int().nonnegative();

const publicOrigin = z.url().superRefine((value, context) => {
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

const environmentSchema = z.object({
  APP_ENCRYPTION_KEY: encryptionKey,
  DATABASE_PATH: z.string().min(1).optional(),
  SYNC_INTERVAL_SECONDS: positiveInteger.default(300),
  NODE_REQUEST_TIMEOUT_MS: positiveInteger.min(100).default(10_000),
  PANEL_PUBLIC_URL: publicOrigin,
  SUBSCRIPTION_PUBLIC_URL: z.url().optional(),
  CONTROL_PLANE_INTERNAL_URL: z.url().optional(),
});

export type RuntimeConfig = {
  appEncryptionKey: Buffer;
  databasePath: string;
  syncIntervalSeconds: number;
  nodeRequestTimeoutMs: number;
  panelPublicUrl: URL;
  subscriptionPublicUrl?: URL;
  controlPlaneInternalUrl?: URL;
};

export function defaultDatabasePath(options?: {
  environment?: RuntimeEnvironment;
  platform?: NodeJS.Platform;
  homeDirectory?: string;
}): string {
  const environment = options?.environment ?? process.env;
  const platform = options?.platform ?? process.platform;
  const homeDirectory = options?.homeDirectory ?? os.homedir();

  let dataDirectory: string;
  if (platform === 'darwin') {
    dataDirectory = path.join(homeDirectory, 'Library', 'Application Support');
  } else if (platform === 'win32') {
    dataDirectory =
      environment.LOCALAPPDATA ?? path.join(homeDirectory, 'AppData', 'Local');
  } else {
    dataDirectory =
      environment.XDG_DATA_HOME ?? path.join(homeDirectory, '.local', 'share');
  }

  return path.join(dataDirectory, 'wg-easy-plane', 'wg-easy-plane.sqlite');
}

export function parseRuntimeConfig(
  environment: RuntimeEnvironment,
  options?: { platform?: NodeJS.Platform; homeDirectory?: string },
): RuntimeConfig {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const variables = [
      ...new Set(
        result.error.issues.map((issue) =>
          String(issue.path[0] ?? 'environment'),
        ),
      ),
    ];
    throw new ConfigError(variables);
  }

  const databasePath =
    result.data.DATABASE_PATH ??
    defaultDatabasePath({
      environment,
      platform: options?.platform,
      homeDirectory: options?.homeDirectory,
    });

  if (!path.isAbsolute(databasePath)) {
    throw new ConfigError(['DATABASE_PATH']);
  }

  return {
    appEncryptionKey: Buffer.from(result.data.APP_ENCRYPTION_KEY, 'base64'),
    databasePath,
    syncIntervalSeconds: result.data.SYNC_INTERVAL_SECONDS,
    nodeRequestTimeoutMs: result.data.NODE_REQUEST_TIMEOUT_MS,
    panelPublicUrl: new URL(result.data.PANEL_PUBLIC_URL),
    ...(result.data.SUBSCRIPTION_PUBLIC_URL
      ? { subscriptionPublicUrl: new URL(result.data.SUBSCRIPTION_PUBLIC_URL) }
      : {}),
    ...(result.data.CONTROL_PLANE_INTERNAL_URL
      ? {
          controlPlaneInternalUrl: new URL(
            result.data.CONTROL_PLANE_INTERNAL_URL,
          ),
        }
      : {}),
  };
}

export function loadRuntimeConfig(): RuntimeConfig {
  dotenv.config({ override: false, quiet: true });
  return parseRuntimeConfig(process.env);
}
