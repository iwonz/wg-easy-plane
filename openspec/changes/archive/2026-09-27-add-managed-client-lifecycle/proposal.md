## Why

The panel can now discover clients but cannot create or maintain one logical client across selected nodes. A managed lifecycle is the core control-plane workflow and must define partial failure, retry, deletion, and ambiguous-create safety before advanced editing or adoption can be added.

## What Changes

- Add managed clients with shared name, optional UTC expiration, enabled state, and one placement per selected node.
- Add best-effort multi-node create, common-field update, enable, disable, add-placement, remove-placement, retry, and tombstone deletion workflows without rollback of successful nodes.
- Persist per-placement desired state, remote identifiers, stable statuses, sanitized operation attempts, and safe error codes.
- Treat create timeouts as ambiguous, prohibit blind retry, synchronize the node, expose safe candidates, and require an explicit remote-client link or cancellation before proceeding.
- Treat remote delete `404` as success and remove the local managed client only after every placement is deleted.
- Block upstream mutations on unhealthy or incompatible nodes while retaining retryable local state.
- Add scoped typed APIs plus localized MobX/Mantine managed-client UI for selecting nodes, viewing partial outcomes, retrying, toggling, and deleting.
- Exclude linked placements from the Discovered list so one remote client is represented in only one panel section.

## Capabilities

### New Capabilities

- `managed-client-lifecycle`: Multi-node managed clients, placement state transitions, safe best-effort operations, retries, ambiguous-create recovery, and tombstone deletion.

### Modified Capabilities

- `client-inventory-sync`: Discovered-client reads exclude remote clients already linked to managed placements while retaining their snapshots for lifecycle and later drift workflows.

## Impact

- Extends shared contracts, OpenAPI routes, generated client, node mutation boundary, managed-client domain services, panel runtime, MobX state, localized UI, and synthetic tests.
- Uses the existing `managed_clients`, `placements`, `operation_attempts`, `remote_clients`, and node tables without a migration.
- Introduces upstream client mutations only through the pinned wg-easy 15.4.0 adapter; configuration and QR payloads remain live-only and out of SQLite, logs, APIs, and test artifacts.
