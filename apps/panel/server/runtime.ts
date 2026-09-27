import {
  ApiTokenService,
  AuthService,
  SubscriptionService,
} from '@wg-easy-plane/auth';
import { loadRuntimeConfig } from '@wg-easy-plane/config';
import { openDatabase } from '@wg-easy-plane/database';
import type { DatabaseConnection } from '@wg-easy-plane/database';
import {
  ArtifactDeliveryService,
  InventorySyncScheduler,
  InventorySyncService,
  ManagedClientService,
  NodeService,
  SubscriptionReadService,
} from '@wg-easy-plane/nodes';

export type PanelAuthRuntime = {
  authService: AuthService;
  trustedOrigin: string;
};

export type PanelApiTokenRuntime = PanelAuthRuntime & {
  apiTokenService: ApiTokenService;
};

export type PanelNodeRuntime = PanelApiTokenRuntime & {
  nodeService: NodeService;
  inventorySyncService?: InventorySyncService;
};

export type PanelInventoryRuntime = PanelNodeRuntime & {
  inventorySyncService: InventorySyncService;
};

export type PanelManagedClientRuntime = PanelInventoryRuntime & {
  managedClientService: ManagedClientService;
};

export type PanelDeliveryRuntime = PanelManagedClientRuntime & {
  artifactDeliveryService: ArtifactDeliveryService;
};

export type PanelSubscriptionRuntime = PanelDeliveryRuntime & {
  subscriptionService: SubscriptionService;
  subscriptionReadService: SubscriptionReadService;
};

type PanelRuntimeState = PanelSubscriptionRuntime & {
  connection: DatabaseConnection;
  inventorySyncScheduler: InventorySyncScheduler;
};

const runtimeGlobal = globalThis as typeof globalThis & {
  __wgepPanelRuntime?: PanelRuntimeState;
};

export function getPanelAuthRuntime(): PanelAuthRuntime {
  if (!runtimeGlobal.__wgepPanelRuntime) {
    const config = loadRuntimeConfig();
    const connection = openDatabase(config.databasePath);
    const nodeService = new NodeService(connection, {
      masterKey: config.appEncryptionKey,
      requestTimeoutMs: config.nodeRequestTimeoutMs,
    });
    const inventorySyncService = new InventorySyncService(
      connection,
      nodeService,
    );
    const inventorySyncScheduler = new InventorySyncScheduler(
      connection,
      inventorySyncService,
      {
        intervalSeconds: config.syncIntervalSeconds,
        requestTimeoutMs: config.nodeRequestTimeoutMs,
      },
    );
    const managedClientService = new ManagedClientService(
      connection,
      nodeService,
      inventorySyncService,
    );
    const artifactDeliveryService = new ArtifactDeliveryService(
      connection,
      nodeService,
    );
    const subscriptionService = new SubscriptionService(connection, {
      masterKey: config.appEncryptionKey,
      ...(config.subscriptionPublicUrl
        ? { subscriptionPublicUrl: config.subscriptionPublicUrl }
        : {}),
    });
    const subscriptionReadService = new SubscriptionReadService(
      connection,
      artifactDeliveryService,
    );
    const state: PanelRuntimeState = {
      connection,
      authService: new AuthService(connection, {
        masterKey: config.appEncryptionKey,
      }),
      apiTokenService: new ApiTokenService(connection, {
        masterKey: config.appEncryptionKey,
      }),
      nodeService,
      inventorySyncService,
      managedClientService,
      artifactDeliveryService,
      subscriptionService,
      subscriptionReadService,
      inventorySyncScheduler,
      trustedOrigin: config.panelPublicUrl.origin,
    };
    runtimeGlobal.__wgepPanelRuntime = state;
    inventorySyncScheduler.start();
  }

  return runtimeGlobal.__wgepPanelRuntime;
}

export function getPanelApiTokenRuntime(): PanelApiTokenRuntime {
  return getPanelAuthRuntime() as PanelRuntimeState;
}

export function getPanelNodeRuntime(): PanelNodeRuntime {
  return getPanelAuthRuntime() as PanelRuntimeState;
}

export function getPanelInventoryRuntime(): PanelInventoryRuntime {
  return getPanelAuthRuntime() as PanelRuntimeState;
}

export function getPanelManagedClientRuntime(): PanelManagedClientRuntime {
  return getPanelAuthRuntime() as PanelRuntimeState;
}

export function getPanelDeliveryRuntime(): PanelDeliveryRuntime {
  return getPanelAuthRuntime() as PanelRuntimeState;
}

export function getPanelSubscriptionRuntime(): PanelSubscriptionRuntime {
  return getPanelAuthRuntime() as PanelRuntimeState;
}
