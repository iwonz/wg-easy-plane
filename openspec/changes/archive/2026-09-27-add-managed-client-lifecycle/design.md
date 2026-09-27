## Context

The schema already models managed clients, placements, operation attempts, desired JSON, tombstones, and an `ambiguous` placement state. The inventory service provides strict last-safe snapshots keyed by node and remote ID, while the node service exclusively owns encrypted credentials and adapter construction. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**

- Keep one durable placement state machine per node and make every partial result visible and retryable.
- Prevent duplicate creation after an indeterminate timeout.
- Preserve complete adapter update fields while changing only shared lifecycle fields.
- Keep remote mutations behind node compatibility and encrypted-credential boundaries.

**Non-Goals:**

- Editing per-node advanced WireGuard or AmneziaWG fields.
- Adopting unrelated discovered clients or resolving external drift.
- Rolling back successful remote mutations when another node fails.
- Downloading or storing configuration and QR payloads.

## Decisions

### Dedicated managed-client service with a node mutation gateway

Add a managed-client service in `packages/nodes` because it coordinates the existing node, inventory, and SQLite placement boundaries. Extend `NodeService` with credential-contained create/update/toggle/delete methods that require a healthy supported node, construct the pinned adapter in memory, map adapter failures to safe node status, and never return credentials or raw responses. Exposing decrypted connections to the lifecycle service was rejected because it widens the secret-bearing surface.

### Placement state machine

New placements begin `pending`. Successful creation stores the numeric remote ID and becomes `active`; definite failures become `error`; create timeout becomes `ambiguous`; synchronized absence of a known remote ID becomes `missing`; deletion first becomes `deleting`. Operation attempts independently record `running`, `succeeded`, `failed`, or `ambiguous`. State changes and attempt completion use short SQLite transactions, never transactions spanning network I/O.

### Best-effort orchestration

Process selected nodes independently and retain successes when another placement fails. Return the complete managed-client representation with placement outcomes rather than fail the whole request for upstream errors. Validation, authorization, duplicate node selection, missing local entities, and database conflicts still fail the request normally.

### Complete desired update snapshots

After creation, synchronize the node and build a complete `WgEasyClientUpdateRequest` from the validated safe remote snapshot. Shared name, expiration, and enabled values override their remote counterparts; all other mutable fields are preserved. Until a post-create snapshot is available, store a strict shared-only desired seed and hydrate it on the next retry/sync before an update. The following advanced-editor change can then update selected desired fields without losing the rest.

### Ambiguous create recovery

On create `TIMEOUT`, mark both placement and attempt ambiguous and immediately request a safe inventory sync. Candidate reads select unlinked snapshots on that placement's node whose name matches the managed client; no candidate is auto-linked. Retry rejects ambiguous placements. An explicit link endpoint validates the chosen node-scoped snapshot and uniqueness constraint, hydrates desired state, stores its remote ID, and activates the placement. A cancel endpoint removes an ambiguous placement locally without an upstream mutation.

### Retry dispatches from durable state

Retry examines placement and parent lifecycle. A deleting placement retries remote deletion. A placement without remote ID retries creation only from `error` or `pending`; `ambiguous` is rejected. A placement with remote ID hydrates desired state from the last safe snapshot and reapplies the parent's shared fields. This makes retry idempotent with respect to known identifiers while keeping create ambiguity explicit.

### Tombstone deletion

Deleting a managed client first persists `lifecycle_status=deleting` and marks every placement deleting. Each known remote ID is deleted best-effort; wg-easy `404` is success. Successful placements are removed locally. The managed client is removed only when no placements remain; otherwise the API returns the tombstone and retry controls remain available.

### Discovered means unlinked

Keep all remote snapshots for audit and state hydration, but change the Discovered query to exclude any `(node_id, remote_client_id)` referenced by a placement. Managed and Discovered tabs therefore remain mutually exclusive without deleting inventory.

## Risks / Trade-offs

- [A create succeeds remotely but sync also fails] → Retain the returned remote ID and active placement with a shared-only desired seed; later retry or sync hydrates the full snapshot.
- [Name matching yields multiple ambiguous candidates] → Show all safe candidates and require explicit operator selection; never choose automatically.
- [Sequential best-effort work is slower across many nodes] → Prefer deterministic SQLite access and simple failure isolation in v1; background retries can parallelize later if measurements justify it.
- [A common update cannot hydrate a missing snapshot] → Mark that placement `missing` after a successful confirming sync or `error` after a failed sync, without mutating other successful placements.
- [Tombstones persist during prolonged outages] → Keep them visible with per-placement retry and never pretend remote deletion succeeded.

## Migration Plan

1. Deploy the service and APIs against the existing schema; existing installations have no managed clients.
2. Existing discovered snapshots remain visible unless explicitly linked by a newly created placement.
3. Rollback leaves managed rows inert and does not issue compensating upstream mutations.
