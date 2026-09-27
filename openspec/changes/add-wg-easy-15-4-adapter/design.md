## Context

The official wg-easy API documentation states that the API is unstable, uses Basic Auth, and cannot be used with 2FA. Inspection of the `v15.4.0` source confirms the file-routed endpoints, the `v15.4.0` release string, `isAwg` mode flag, full client update body, and identical `401` path for invalid credentials and 2FA. The client list also includes `oneTimeLink` and runtime `endpoint` values that this control plane must not propagate. See `proposal.md` for motivation and `specs/wg-easy-adapter/spec.md` for observable behavior.

## Goals / Non-Goals

**Goals:**

- Make every upstream assumption executable as a strict schema or transport invariant.
- Give later services safe typed values and stable failure codes without access to credentials or raw error bodies.
- Support trusted and explicitly insecure TLS without changing process-global TLS behavior.
- Keep configuration and QR material ephemeral and bounded.

**Non-Goals:**

- Persisting nodes, snapshots, clients, configurations, QR codes, or operation attempts; later changes own those workflows.
- Supporting any wg-easy release other than 15.4.0, session-cookie auth, OAuth, 2FA, setup/admin endpoints, or one-time-link endpoints.
- Reproducing wg-easy implementation code or accepting its TypeScript types as a runtime trust boundary.

## Decisions

### Standalone adapter package

Create `packages/wg-easy-adapter` with only Zod and Node standard-library networking dependencies. It exports the adapter, pinned schemas/types, and sanitized error class; it knows nothing about SQLite, Hono, Next.js, or UI. This prevents upstream response types from leaking into domain/storage code and keeps local mock-server tests fast.

### Source-derived, runtime-strict schemas

Model the observed 15.4.0 JSON contract independently with strict Zod objects. Raw list entries include every source field, including the nested one-time-link relation and runtime endpoint, so a new or missing upstream field fails compatibility validation. A second projection constructs a safe client object and deliberately omits `oneTimeLink` and `endpoint`. Trusting compile-time interfaces or permissive passthrough schemas was rejected because the upstream API explicitly changes without notice.

### Compatibility before mutation

Each adapter instance caches only a successful information check for its lifetime. `probe()` performs information then authenticated inventory. Every mutation calls the compatibility guard first; if no successful check exists, it fetches information before the mutation. Unsupported and malformed versions never reach a mutating endpoint. The later node service may create a fresh adapter for each request when it needs a new check rather than relying on long-lived cache.

### Node standard-library transport

Implement bounded HTTP(S) requests with `node:http` and `node:https`. Node does not follow redirects automatically, permits per-request `rejectUnauthorized`, supports explicit timeouts, and avoids adding a transport dependency solely for insecure TLS. Read at most 1 MiB by default and destroy the response if the limit is exceeded. Build Basic Auth in memory immediately before protected requests and never attach credentials to URLs.

### Stable safe errors

`WgEasyAdapterError` carries a code, operation identifier, and optional safe HTTP status or detected version. It never retains the request URL, headers, credentials, raw network error, Zod issue input, or response body. TLS error recognition uses a closed set of Node certificate error codes; other connection failures map to `UNREACHABLE`. Upstream `401` and relevant `403` responses map to `AUTH_FAILED`, with copy explaining that invalid credentials and 2FA are indistinguishable in 15.4.0.

### Complete mutations, idempotent delete signal

Creation sends exactly name and nullable expiration. Update requires the complete source `ClientUpdateSchema` shape so omitted advanced values cannot accidentally reset remote state. Enable and disable use their dedicated POST endpoints. Delete maps upstream `404` to a returned `not_found` result rather than an exception, allowing the later tombstone state machine to implement idempotent deletion without inspecting HTTP details.

### Ephemeral artifact validation

Configuration and QR methods return fresh `Uint8Array` values and do not expose response headers beyond a normalized media type. Configuration requires `application/octet-stream`. QR requires `image/svg+xml`, an SVG root, and rejects doctype, script, foreignObject, event-handler attributes, and non-fragment `href` values before returning bytes. This is defense in depth before the later no-store proxy endpoints.

### Synthetic fixtures only

Hand-author fixtures from the verified schemas using RFC 5737/3849 documentation addresses and obviously synthetic names. Local HTTP servers assert paths, methods, bodies, Basic Auth presence, timeout, redirect blocking, version gate, and sanitized errors. No live-node mode or recording facility is included.

## Risks / Trade-offs

- [Strict schemas can reject harmless upstream additions] → Fail closed as `API_INCOMPATIBLE`; preserving the last safe snapshot is intentionally handled by the later sync service.
- [Information checks can fail because wg-easy itself performs a release lookup] → Report a sanitized upstream failure; operators can use wg-easy's version-check setting, but the adapter does not bypass the endpoint.
- [A per-instance compatibility cache can become stale after a node upgrade] → Keep adapter instances short-lived in later services and require sync/probe to construct or reset compatibility state.
- [Basic Auth cannot identify 2FA specifically] → Use one `AUTH_FAILED` code and actionable UI wording that mentions both possible causes.
- [SVG validation may reject future generator output] → Treat that as an explicit compatibility event rather than proxying unreviewed active content.

## Migration Plan

1. Add the isolated package and synthetic tests; no runtime route or database changes occur.
2. Later node management creates adapters from decrypted per-node credentials and maps stable adapter errors to persisted node statuses.
3. Rollback removes the unused package without data migration because this change persists nothing.
