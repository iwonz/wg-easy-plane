## Why

The control plane cannot discover or manage clients until administrators can safely register wg-easy nodes and understand whether each connection is usable. Node credentials and endpoints are especially sensitive, so their first persisted and API-visible workflow needs explicit encryption, redaction, compatibility, and authorization boundaries.

## What Changes

- Add encrypted node-credential storage backed by a dedicated HKDF-derived AES-256-GCM key and field-bound authenticated encryption.
- Add scoped `/api/v1/nodes` CRUD and connection-test endpoints with safe node metadata only.
- Probe both wg-easy information and authenticated client inventory when nodes are created, edited, or tested, then map adapter failures to the defined node statuses.
- Preserve failed nodes with an actionable safe status, support retry after correction, and retain credentials omitted during edits.
- Add Mantine/MobX node management UI with persistent insecure-TLS warnings and localized status feedback.
- Block deletion when managed placements reference a node and never perform implicit upstream client deletion.

## Capabilities

### New Capabilities

- `node-management`: Secure node registration, encrypted credentials, scoped CRUD, connection tests, compatibility status, TLS policy, and administrative UI.

### Modified Capabilities

None.

## Impact

- Adds a reusable node-management domain package that depends on the database and pinned wg-easy adapter.
- Extends shared contracts, the Hono/OpenAPI surface, generated client, panel runtime, MobX state, localized panel UI, and tests.
- Uses the existing `nodes` and `placements` schema; no new migration or live upstream fixture is required.
