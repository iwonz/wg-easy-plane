## Context

Remote snapshots already contain every validated safe field needed to reconstruct the pinned complete update contract. Placements already persist complete desired payloads and have `drift` and `missing` states, but periodic sync currently updates only inventory rows. Discovered rows are excluded once a placement references their node and remote identifier.

## Goals / Non-Goals

**Goals:**

- Make adoption explicit, node-scoped, duplicate-safe, and free of surprise remote mutation.
- Classify drift only from a complete successful sync and never replace durable intent automatically.
- Provide a safe exact diff and separate accept-remote versus reapply-desired actions.
- Recover confirmed missing placements without blindly reusing potentially reassigned addresses.

**Non-Goals:**

- Automatically grouping equal names, choosing adoption candidates, or adopting more than one remote client from a node.
- Automatically resolving drift or rolling back a remote out-of-band change.
- Diffing immutable keys, traffic telemetry, node credentials, configuration, or QR content.
- Preserving a missing remote client's old per-node addresses when a replacement is created.

## Decisions

### Shared mutable-state helpers

Create one internal client-state module that projects a validated safe snapshot into the exact complete wg-easy update shape, overlays managed shared fields when building desired state, produces stable field-level differences, and parses durable desired JSON. Inventory reconciliation and managed-client operations use the same helpers so comparison and mutation cannot diverge.

### Adoption is local and explicit

POST adoption accepts a managed name, optional expiration, enabled state, and one `(nodeId, remoteClientId)` selection per node. In one transaction it verifies every current snapshot is unlinked and belongs to a healthy supported node, creates the managed row and placements, and stores a complete desired payload built from each remote's advanced fields plus the requested common fields. A placement is active only when its actual full mutable state already matches; otherwise it begins in drift. No upstream request occurs.

### Sync-driven classification

After a node's complete inventory is atomically stored, reconcile its linked placements in the same transaction. A current snapshot is compared to complete durable desired state and becomes active or drift. Confirmed absence becomes missing. Shared-only desired seeds are hydrated from the current snapshot plus the parent common fields before comparison. Failed or incompatible sync leaves both snapshots and placement states unchanged.

### Safe exact diff

The drift read returns desired and remote complete mutable states plus an ordered list of changed fields from a fixed enum. Values are restricted to strings, booleans, finite numbers, null, or string arrays. Remote absence returns `remote=null` and no fabricated differences. Key material, telemetry, endpoints observed at runtime, and delivery artifacts never enter the representation.

### Accept remote is local state resolution

Accepting remote stores the selected current remote advanced state as desired. Because name, expiration, and enabled are managed-wide, the selected remote values become the managed client's new common fields and are overlaid onto every other placement's durable desired payload. All linked placements are then reclassified locally from existing safe snapshots; no upstream mutation occurs.

### Reapply desired is placement-scoped

Reapply invokes one complete update for the selected known remote identifier through the existing mutation gateway. The durable desired payload is not rewritten. Success synchronizes and returns active when confirmed; failure remains visible and retryable without affecting another placement.

### Missing recreation allocates fresh advanced state

Recreate is allowed only after a successful sync marked the placement missing. It clears the stale remote identifier, replaces desired state with the managed shared seed, and follows the normal create state machine. A successful create then hydrates addresses and other advanced values assigned to the new remote. A create timeout remains ambiguous and requires the existing candidate-resolution flow.

## Risks / Trade-offs

- [Accepting one remote shared state causes drift elsewhere] → Recompute every placement and make those differences visible; never mutate other nodes implicitly.
- [A stale safe snapshot is used for accept] → Require `missing_at` to be null and expose the snapshot timestamp in the drift view; operators can sync immediately before resolving.
- [Adoption selections race another request] → Use existing unique placement constraints inside one transaction and return conflict on any linked candidate.
- [Replacement loses old advanced tuning] → Prefer newly allocated safe upstream values; the operator can re-enter advanced settings explicitly afterward.

## Migration Plan

1. Deploy without a database migration; existing complete desired payloads are immediately comparable.
2. The first successful sync classifies existing placements as active, drift, or missing.
3. Rollback leaves statuses and desired JSON valid for the previous lifecycle service; no automatic remote mutation needs compensation.
