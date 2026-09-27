## Why

The panel shell currently gives permanent space to secondary information and token management, while its language and theme controls are larger than the actions they represent. More importantly, the per-node insecure TLS escape hatch weakens the control plane's trust boundary and must be removed before the project evolves beyond its first public API release.

## What Changes

- Replace the panel's repeated state-specific controls with one compact header that shows the existing logo, cyclic theme and locale actions, and an authenticated avatar menu.
- Present nodes and clients as the panel's two primary outer tabs while retaining the managed/discovered client tabs.
- Move API token management behind the authenticated avatar menu into a lazy-loaded modal workflow that clears one-time secrets and transient state when dismissed.
- Simplify first-administrator setup copy and remove the authenticated introductory card.
- Apply the compact cyclic theme and locale controls to both the panel and subscription applications without locale-prefixed routes.
- **BREAKING** Remove `allowInsecureTls` from node requests, safe metadata, OpenAPI, generated clients, persistence, UI, services, and the wg-easy adapter; all HTTPS connections always verify certificates.
- Migrate existing databases without losing nodes, clients, placements, or snapshots, and fail closed any formerly insecure node as `tls_error` / `TLS_ERROR` until a trusted certificate passes a new probe.
- Preserve safe TLS error classification while rejecting legacy requests that still contain the removed field.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `application-shell`: Require compact cyclic locale and color-scheme actions across both applications and define the shared panel header behavior.
- `admin-auth`: Refine setup copy and the authenticated avatar menu while removing redundant authenticated identity content.
- `api-tokens`: Move panel token management to a lazy modal stack opened from the profile menu and require sensitive transient state cleanup.
- `node-management`: Remove the insecure TLS option from the public contract and persistence, require trusted certificates, and define fail-closed migration behavior.
- `wg-easy-adapter`: Require certificate verification for every HTTPS adapter request with no bypass while preserving safe TLS error classification.

## Impact

This change affects both Next.js applications, shared UI controls and translations, panel MobX stores, node API contracts and generated client, OpenAPI output, node services, the wg-easy transport, SQLite schema and migrations, and their unit, integration, and browser tests. The API remains under `/api/v1`, but strict request validation makes removal of `allowInsecureTls` incompatible with v1 clients, so the resulting release is a SemVer major release. No new environment variables or runtime dependencies are required, and local environment files remain untouched.
