## Context

The initial SQLite schema already contains node, placement, remote-client, and sync tables, while the preceding change added an isolated, version-pinned wg-easy adapter. The panel currently composes authentication and PAT services directly in its runtime and exposes OpenAPI routes through Hono. See `proposal.md` for motivation and `specs/node-management/spec.md` for observable behavior.

## Goals / Non-Goals

**Goals:**

- Keep plaintext node credentials inside request handling, authenticated encryption, and adapter construction only.
- Reuse one domain service from cookie-authenticated UI and PAT-authenticated API flows.
- Make connection failure a persisted, recoverable node state rather than losing operator input.
- Keep every response, exception, fixture, and test assertion safe for a public repository.

**Non-Goals:**

- Persisting remote-client inventory, scheduling synchronization, or exposing manual sync; the next change owns those workflows.
- Mutating wg-easy clients, storing configuration or QR payloads, or supporting upstream versions other than 15.4.0.
- Performing public-internet SSRF filtering: connecting to operator-specified private hosts is a core product requirement, and authorization plus strict host syntax is the intended boundary.

## Decisions

### Reusable node domain package

Create `packages/nodes` with a `NodeService`, credential cryptography, cursor pagination, status mapping, and database operations. It depends only on shared contracts, database, and the wg-easy adapter. Keeping this logic out of Hono makes it reusable by the upcoming scheduler and client lifecycle services and permits deterministic fake-adapter tests.

### Field-bound AES-256-GCM

Derive a 32-byte node credential key from `APP_ENCRYPTION_KEY` with HKDF-SHA-256 using a node-specific salt namespace. Store each value as a versioned string containing a random 96-bit IV, ciphertext, and authentication tag. Use `nodeId + credential field` as additional authenticated data so copying a username ciphertext into a password field or another node fails authentication. A single undifferentiated encryption helper without AAD was rejected because database-value substitution would remain undetected.

### Safe metadata contract

Shared `NodeMetadata` contains identifiers, connection coordinates, TLS policy, normalized status, safe adapter error code, detected version/mode, and timestamps. It intentionally excludes username, password, both ciphertext columns, remote client count, upstream response content, and URLs containing credentials. Update credentials are optional; omission retains existing encrypted values.

### Persist failed configuration with status

Create and connection-setting update validate uniqueness, probe outside a database transaction, then persist encrypted configuration plus the safe probe result. This lets an operator correct an offline, self-signed, miscredentialed, 2FA-enabled, or temporarily incompatible node. Rejecting every failed probe was considered but would prevent representing and repairing the statuses required by the control plane.

### Probe boundaries and status mapping

Use adapter `probe()` so information/version validation always precedes authenticated inventory validation. Map `AUTH_FAILED`, `TLS_ERROR`, and `UNSUPPORTED_VERSION` directly; contract, not-found, redirect, and response-size failures become `api_incompatible`; timeout, unreachable, and generic upstream failures become `unreachable`. Unexpected internal errors remain server errors rather than being mislabeled. Successful probes set `healthy`, `15.4.0`, and detected mode. Transient failures preserve prior safe version/mode; unsupported-version results may replace the displayed detected version with the adapter's safe scalar.

### Test and mutation API layout

Use `/api/v1/nodes` for cursor list/create, `/api/v1/nodes/test` for an unsaved probe, and `/api/v1/nodes/{nodeId}` for detail/update/delete plus `/test` for stored retest. Register the static `/test` route before parameter routes. Cookie requests use the existing trusted-Origin rule for mutations; PATs require exact `nodes:read` or `nodes:write` scope.

### Patch semantics

Node update is a strict partial document with at least one property. A display-name-only patch skips the upstream probe. Any protocol, host, port, TLS, username, or password change reconstructs the full connection, decrypting omitted credentials in memory, then probes before storing the result. This avoids making harmless renames depend on node availability while ensuring every effective connection change is verified.

### UI state hygiene

The MobX store holds only safe node metadata and transient form values supplied by its caller. React component state owns credential inputs, resets passwords after every submission/test, never writes credentials to storage, and never includes them in routes. Insecure TLS uses both a form warning and a persistent warning badge/alert on stored nodes.

## Risks / Trade-offs

- [Persisting an unreachable node may retain a typo] → Show the precise safe status, make edit/retest immediate, and never begin client mutation while the node is unhealthy.
- [A database copied without `APP_ENCRYPTION_KEY` cannot recover credentials] → This is intentional; decryption fails closed and backup guidance must treat the key separately.
- [Hostnames can resolve differently over time] → Revalidate through every explicit probe and later synchronization while keeping redirect following disabled.
- [A probe fetches the complete client list] → The adapter enforces a 1 MiB response bound and this change discards the list immediately; the next change will persist only safe projections.
- [Credentials exist briefly in browser form state] → Clear password fields after requests, use no-store API responses, and prohibit browser persistence and test recordings.

## Migration Plan

1. Add the node package and API/UI consumers without changing the existing database schema.
2. Existing installations begin with an empty node table; newly stored ciphertext uses the versioned format.
3. Rollback removes API/UI/package code; any created node rows can remain inert for a later redeploy because no upstream mutation occurred.
