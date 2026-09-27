import { ApiTokenService, AuthService } from '@wg-easy-plane/auth';
import { loadRuntimeConfig } from '@wg-easy-plane/config';
import { openDatabase } from '@wg-easy-plane/database';
import type { DatabaseConnection } from '@wg-easy-plane/database';
import { NodeService } from '@wg-easy-plane/nodes';

export type PanelAuthRuntime = {
  authService: AuthService;
  trustedOrigin: string;
};

export type PanelApiTokenRuntime = PanelAuthRuntime & {
  apiTokenService: ApiTokenService;
};

export type PanelNodeRuntime = PanelApiTokenRuntime & {
  nodeService: NodeService;
};

type PanelRuntimeState = PanelNodeRuntime & {
  connection: DatabaseConnection;
};

const runtimeGlobal = globalThis as typeof globalThis & {
  __wgepPanelRuntime?: PanelRuntimeState;
};

export function getPanelAuthRuntime(): PanelAuthRuntime {
  if (!runtimeGlobal.__wgepPanelRuntime) {
    const config = loadRuntimeConfig();
    const connection = openDatabase(config.databasePath);
    runtimeGlobal.__wgepPanelRuntime = {
      connection,
      authService: new AuthService(connection, {
        masterKey: config.appEncryptionKey,
      }),
      apiTokenService: new ApiTokenService(connection, {
        masterKey: config.appEncryptionKey,
      }),
      nodeService: new NodeService(connection, {
        masterKey: config.appEncryptionKey,
        requestTimeoutMs: config.nodeRequestTimeoutMs,
      }),
      trustedOrigin: config.panelPublicUrl.origin,
    };
  }

  return runtimeGlobal.__wgepPanelRuntime;
}

export function getPanelApiTokenRuntime(): PanelApiTokenRuntime {
  return getPanelAuthRuntime() as PanelRuntimeState;
}

export function getPanelNodeRuntime(): PanelNodeRuntime {
  return getPanelAuthRuntime() as PanelRuntimeState;
}
