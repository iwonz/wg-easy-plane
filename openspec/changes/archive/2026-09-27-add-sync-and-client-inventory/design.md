## Context

The SQLite schema already contains nodes, composite-keyed remote-client snapshots, sync runs, and a named lease. The node service owns encrypted credentials and the pinned adapter probe, while the panel runtime is a process-local singleton. The adapter's validated client model intentionally omits configuration, QR, endpoint, and one-time-link material. See `proposal.md` for motivation and the capability specs for observable behavior.

## Goals / Non-Goals

**Goals:**

- Make every successful inventory a transactional, deterministic snapshot with explicit missing and freshness semantics.
- Keep credentials inside the node service and return only strict safe adapter projections to the synchronization service.
- Support immediate, manual, and scheduled entry points without overlapping work or adding a second process.
- Preserve useful inventory through every failed or incompatible upstream interaction.

**Non-Goals:**

- Mutating, adopting, grouping, or delivering configurations for remote clients.
- Automatically reconciling drift or deleting snapshots that disappear upstream.
- Supporting multiple panel replicas or wg-easy versions other than 15.4.0.
- Persisting arbitrary upstream response fields for future compatibility.

## Decisions

### Node-owned inventory fetch boundary

Extend the node service with a stored-node inventory fetch that decrypts credentials in memory, constructs the adapter, runs the same strict probe, persists safe node status, and returns validated client objects only on success. The synchronization service receives no credentials or connection URL. A separate repository that exposed decrypted node connections was rejected because it would widen the secret-bearing API and make accidental logging easier.

### Transactional reconcile after complete validation

The adapter fully validates `/api/information` and `GET /api/client` before the sync service starts a SQLite transaction. Within one transaction it upserts returned composite identities, preserves `first_seen_at`, refreshes `last_seen_at`, clears `missing_at`, marks absent rows missing, and updates `nodes.last_synced_at`. Failures occur before reconciliation and therefore cannot partially erase or stale a known-good snapshot.

### Canonical safe snapshots

Serialize only the explicit `WgEasyClient` safe model into `public_data` and compute SHA-256 over a recursively key-sorted JSON representation. Parse stored JSON back through a shared strict public schema before serving it. Unknown upstream fields are discarded at the adapter boundary rather than retained. This keeps hashes deterministic and prevents later upstream additions from silently entering SQLite or APIs.

### Run records and sanitized outcomes

Create a run row before the network request and finish it in a short write after success or failure. Public summaries contain run identifier, node identifier, state, seen/missing counts, timestamps, and the adapter's stable error code only. Unexpected programmer/database errors are not converted into upstream payloads; the run receives a generic safe code before the original error propagates.

### Process-local node exclusion plus SQLite cycle lease

Use a process-local map of in-flight node promises to reject duplicate manual attempts and prevent a scheduled cycle from overlapping the same node. Scheduled cycles first acquire a compare-and-set SQLite lease with a random process holder and expiry longer than the request budget for all current nodes, refreshing it while the cycle advances. The database lease protects hot reload or accidental duplicate runtimes; the documented single-replica constraint remains unchanged. Holding a database transaction during network I/O was rejected because it would block unrelated panel writes.

### Lazy unref'ed scheduler

Construct and start one scheduler from the cached panel runtime. A positive interval schedules periodic cycles and uses an unref'ed timer; zero creates no timer. It does not execute during module import or static build. The node-create route invokes the same sync service after a healthy create; manual and immediate attempts do not require the scheduler lease because per-node exclusion already protects the single supported process.

### Cursor identity and stale presentation

Order discovered records by `last_seen_at`, `node_id`, then `remote_client_id`, encoding all three values into an opaque validated cursor. API records include node ID, safe node display name/mode, the numeric remote ID, approved public snapshot, timestamps, missing marker, and upstream version. Names never drive identity or grouping.

### Compatibility warning derived from safe node metadata

The authenticated UI derives the global warning from node statuses already returned by the node API. It does not name endpoints or echo adapter error text. The discovered store is independently authorized with `clients:read`; manual sync stays on the node resource and requires `nodes:write`.

## Risks / Trade-offs

- [A large fleet makes a scheduled cycle outlive its lease] → Refresh the lease between nodes and use a conservative expiry derived from the request timeout and node count.
- [A process crashes after creating a running run] → On the next attempt, close prior running runs for that node as failed with a stable interruption code before creating the new run.
- [A healthy create performs a second read-only probe] → Accept the bounded extra request in this change to keep node creation and snapshot transactions separated; later optimization may pass an already validated probe internally without changing behavior.
- [Snapshots retained indefinitely include obsolete client names] → Mark them missing and display their state; retention/deletion policy is intentionally deferred until lifecycle requirements are known.
- [Browser polling could expose sensitive timing patterns] → Refresh only on explicit actions in this change and return no host, credential, or raw error data from inventory endpoints.

## Migration Plan

1. Deploy the new code against the existing schema; no migration is required.
2. Existing nodes have no snapshots until the first immediate, manual, or scheduled successful synchronization.
3. Rollback stops new syncs while leaving safe snapshots and timestamps inert for a later redeploy.
