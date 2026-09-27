import { AuthService } from '@wg-easy-plane/auth';
import { loadRuntimeConfig } from '@wg-easy-plane/config';
import { openDatabase } from '@wg-easy-plane/database';
import type { DatabaseConnection } from '@wg-easy-plane/database';

export type PanelAuthRuntime = {
  authService: AuthService;
  trustedOrigin: string;
};

type PanelRuntimeState = PanelAuthRuntime & {
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
      trustedOrigin: config.panelPublicUrl.origin,
    };
  }

  return runtimeGlobal.__wgepPanelRuntime;
}
