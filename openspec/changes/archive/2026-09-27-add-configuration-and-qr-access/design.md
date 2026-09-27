## Context

The pinned wg-easy adapter already validates and returns configuration bytes and safe SVG QR bytes, but the control plane has no domain resolver, API routes, or panel controls for those methods. Delivery material is equivalent to a connection secret, while existing inventory and placement rows intentionally contain only safe metadata. See `proposal.md` and `specs/configuration-delivery/spec.md` for scope and observable behavior.

## Goals / Non-Goals

**Goals:**

- Resolve a request from safe local identities to exactly one node and remote client.
- Reuse the pinned adapter trust boundary and keep artifact bytes in memory only for the current response.
- Make cache, filename, authorization, and error behavior explicit and testable.
- Support the same panel experience for eligible managed and discovered records.

**Non-Goals:**

- Persisting, prefetching, caching, transforming, or regenerating configuration or QR payloads.
- Adding subscription access, public links, bulk archives, one-time links, or delivery audit bodies.
- Supporting upstream versions other than wg-easy 15.4.0.

## Decisions

### Resolve local identities in a dedicated delivery service

A delivery service will query safe local metadata, enforce placement or discovered-snapshot eligibility, and call narrow node-service artifact methods. Managed routes use local client and placement UUIDs; discovered routes use node UUID plus numeric remote client ID. This prevents callers from using a generic node proxy to reach arbitrary upstream paths. Resolving directly in route handlers was rejected because it would duplicate database and safety rules across four endpoints.

### Authorize with the existing `clients:read` boundary

Both administrator cookie sessions and PATs with `clients:read` may retrieve artifacts. Authorization runs before target resolution, credential decryption, or network access. A new scope was rejected because the approved v1 scope vocabulary is fixed and the API already treats client read access as the relevant client-delivery boundary.

### Reuse the adapter's validated in-memory artifact contract

Node service methods construct a compatible adapter only after checking stored node health and version, then call `getConfiguration` or `getQrCode`. The adapter continues to enforce content type, response size, redirect, timeout, and active-content checks. Bytes pass directly from adapter to HTTP response and are never supplied to database, logger, analytics, MobX state, or generated fixtures. Re-fetching artifacts in the browser and converting them to data URLs was rejected because it creates unnecessary copies and storage risk.

### Use explicit binary OpenAPI responses and centralized privacy headers

Four typed routes declare `application/octet-stream` or `image/svg+xml` responses and standard safe JSON errors. Route middleware sets `Cache-Control: private, no-store`, `Pragma: no-cache`, and `Expires: 0`; configuration responses also set a sanitized attachment filename. Hono returns a fresh byte copy as the response body. No route, error, or test snapshot includes artifact content.

### Sanitize filenames from display metadata only

The filename helper normalizes client and node names to a short ASCII allowlist, collapses separators, removes leading dots, applies a fixed length bound, and falls back to `wireguard-client.conf`. Hostnames, IP addresses, UUIDs, credentials, and remote response values are never used. Raw Unicode filename parameters were rejected to avoid header encoding and log-handling differences across proxies.

### Keep QR rendering ephemeral

The panel points a short-lived image element directly at the authenticated QR endpoint and removes it when the modal closes. Configuration download uses a normal authenticated link with browser download semantics. The MobX store retains only safe inventory metadata; it never fetches or stores artifact bytes.

## Risks / Trade-offs

- [Artifact bytes are buffered by the pinned adapter before response] → Keep the existing strict response-size limit, return a fresh response only, and never retain the buffer beyond request scope.
- [An upstream client can disappear after local eligibility validation] → Map the race to a stable safe upstream/conflict error and rely on the next successful sync to mark it missing.
- [A reverse proxy can still log response sizes or paths] → Paths contain only local IDs, tokens are absent, and deployment guidance continues to require header-sensitive logging controls.
- [A `clients:read` PAT can retrieve connection material] → Treat the scope as privileged client read access, show secrets only in response bodies, and rely on expiry/revocation already enforced by PAT middleware.

## Migration Plan

No schema migration is required. Deploy the API and panel together, regenerate OpenAPI artifacts, and roll back by reverting the routes, UI controls, and delivery service; retained database state is unchanged in either direction.
