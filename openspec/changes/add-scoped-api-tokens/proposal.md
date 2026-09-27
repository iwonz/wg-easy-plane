## Why

External automation needs credentials that are independent from browser cookies, revocable without changing the administrator password, and limited to explicit control-plane capabilities. Adding scoped personal access tokens now establishes the authorization boundary that later node, client, and subscription APIs can reuse.

## What Changes

- Add personal access tokens with the `wgep_pat_*` format, one-time secret disclosure, keyed-hash-only persistence, optional expiration, last-used metadata, and revocation.
- Define the fixed scopes `system:read`, `nodes:read`, `nodes:write`, `clients:read`, `clients:write`, `subscriptions:read`, `subscriptions:write`, and `tokens:manage`.
- Add cursor-paginated token listing, creation, and revocation endpoints for the authenticated administrator and PATs carrying `tokens:manage`.
- Add reusable Bearer authentication and exact-scope authorization for subsequent API changes, with safe `401` and `403` responses.
- Add a localized Mantine/MobX token-management UI that reveals a newly created secret only once.

## Capabilities

### New Capabilities

- `api-tokens`: Scoped personal access token lifecycle, Bearer authentication, authorization, metadata exposure, and administrator management UI.

### Modified Capabilities

None.

## Impact

- Adds token lifecycle and request-principal logic to `packages/auth` and uses the existing `api_tokens` SQLite table.
- Extends shared Zod/OpenAPI contracts, Hono routes, generated API artifacts, and the authenticated panel UI.
- Adds security-focused unit and integration coverage for secret storage, scope enforcement, expiration, last-used tracking, and revocation.
- Never persists or returns a PAT after its one-time creation response and never includes Authorization values in errors or logs.
