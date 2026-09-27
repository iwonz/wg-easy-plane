## Why

Registered nodes are currently probed only for connectivity, so the panel cannot retain a safe, current inventory of upstream clients or distinguish fresh data from the last known good snapshot. Synchronization must be introduced before managed-client workflows so later mutations have a deterministic local view and compatibility failures never destroy usable inventory.

## What Changes

- Add a synchronization domain service that fetches strictly validated wg-easy 15.4.0 client inventories and atomically reconciles public snapshots per node.
- Preserve the last safe snapshot on connection, authentication, TLS, version, or contract failures and mark clients missing only after a successful complete inventory.
- Record sanitized sync runs and coordinate scheduled work with an expiring SQLite lease plus per-node overlap protection.
- Run synchronization every `SYNC_INTERVAL_SECONDS` (300 by default), allow `0` to disable scheduling, trigger sync after healthy node creation, and expose scoped manual sync.
- Add a paginated read-only discovered-client API and a localized MobX/Mantine inventory view that keeps same-named clients on different nodes separate.
- Add a global compatibility warning for unsupported or API-incompatible nodes without exposing endpoints, credentials, upstream bodies, or client secrets.

## Capabilities

### New Capabilities

- `client-inventory-sync`: Safe node inventory synchronization, scheduling, leases, run history, stale snapshots, discovered-client reads, and compatibility visibility.

### Modified Capabilities

- `node-management`: Healthy node creation triggers inventory synchronization and stored node metadata exposes the last successful synchronization time.

## Impact

- Adds synchronization and discovered-inventory services to `packages/nodes`, using existing `remote_clients`, `sync_runs`, `sync_leases`, and node tables.
- Extends runtime configuration, shared contracts, Hono/OpenAPI routes, generated client, panel runtime, MobX state, localized UI, and synthetic tests.
- Performs additional read-only requests to registered wg-easy nodes; it introduces no upstream mutations and stores only the adapter's safe public client projection.
