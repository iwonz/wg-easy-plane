## Why

The panel can create managed clients and edit their desired per-node state, but existing discovered clients cannot be brought under management and out-of-band changes are not surfaced. Operators need an explicit, non-destructive adoption flow plus a safe way to inspect and resolve drift or recover a placement whose remote client disappeared.

## What Changes

- Add explicit adoption of one current unlinked remote client per selected node into one managed client without an implicit upstream mutation.
- Reconcile linked placements after every successful complete node sync: matching desired state becomes active, differences become drift, and confirmed absence becomes missing.
- Add a strict safe field-level drift representation for the exact wg-easy 15.4.0 mutable contract.
- Add explicit resolution actions to accept a selected remote state locally or reapply the durable desired state to only that placement.
- When remote shared fields are accepted, update the managed client's common fields and recompute every placement locally without hidden upstream writes.
- Add explicit missing-placement recreation that creates a new remote identity and hydrates its newly allocated advanced fields; blind reuse of a missing client's addresses is prohibited.
- Add scoped typed APIs plus localized MobX/Mantine adoption, drift inspection, accept, reapply, and missing recovery controls.
- Keep credentials, keys, configurations, QR payloads, raw upstream bodies, and node endpoints outside adoption and drift APIs, persistence, logs, and browser storage.

## Capabilities

### New Capabilities

- `adoption-and-drift-resolution`: Explicit discovery adoption, sync-driven drift/missing classification, safe diffs, and operator-directed resolution.

### Modified Capabilities

- `client-inventory-sync`: Successful reconciliation also classifies linked managed placements against their durable desired state without overwriting it.

## Impact

- Extends shared contracts, OpenAPI routes, generated client, inventory reconciliation, managed-client domain service, MobX state, localized panel UI, and synthetic tests.
- Uses existing managed-client, placement, remote snapshot, and operation-attempt tables without a migration.
- Introduces no new upstream endpoints; reapply and recreate continue through the pinned wg-easy 15.4.0 adapter boundary.
