## Context

The storage foundation already includes an `api_tokens` table with UUID, name, safe prefix, token hash, JSON scopes, expiration, last-used, revocation, and creation timestamps. Browser authentication supplies a single-administrator cookie session and exact Origin protection, while Hono already advertises a Bearer security scheme but has no implementation. See `proposal.md` for motivation and `specs/api-tokens/spec.md` for observable behavior.

## Goals / Non-Goals

**Goals:**

- Provide a framework-independent token service and reusable request-principal authorization boundary for every later resource API.
- Keep raw PAT material confined to generation, the one successful HTTP response, and transient UI state.
- Keep browser-cookie CSRF handling distinct from non-browser Bearer authentication.
- Preserve deterministic security tests with injected clock, random-byte, and UUID sources.

**Non-Goals:**

- Fine-grained resource IDs, roles, scope wildcards, implicit read/write hierarchy, token rotation, or recoverable secrets.
- Protecting the existing public setup/status and API-documentation endpoints with PATs.
- Adding scopes for capabilities that are not already listed in the product plan.

## Decisions

### Token service remains in the authentication package

Add `ApiTokenService` beside browser `AuthService`, sharing only database and cryptographic primitives. It generates, authenticates, lists, and revokes PATs without HTTP dependencies. Keeping PAT logic in panel routes was rejected because later APIs need the same principal and scope invariants and because hash-only persistence needs direct unit coverage.

### Versioned random token and HKDF-separated hash

Generate 32 random bytes, encode them as unpadded base64url, and prefix with `wgep_pat_`. Derive a dedicated HMAC-SHA-256 key from `APP_ENCRYPTION_KEY` using a versioned `auth/api-token` HKDF label, and store only the HMAC plus `wgep_pat_` and the first eight random characters for identification. A plain database hash would still be safe for 256-bit tokens, but keyed hashing preserves domain separation and reduces the impact of implementation mistakes or lower-entropy future formats.

### Exact scopes and explicit request principals

Define the eight scopes once in the contracts package and reuse that runtime tuple in validation, service types, UI options, and generated OpenAPI schemas. Authorization compares exact string membership; write never implies read. Hono request context carries either `{ kind: 'admin', adminId }` or `{ kind: 'api-token', tokenId, scopes }`. Future routes can request a scope without knowing credential storage details.

### Authorization header takes precedence

If an Authorization header is present, middleware accepts only one syntactically valid Bearer PAT and never falls back to an access cookie. Without Authorization, panel endpoints may authenticate the access cookie. This prevents a broken or attacker-injected Bearer value from silently exercising the broader browser authority. Mutating cookie requests additionally require the configured exact Origin; Bearer requests do not use Origin as an authorization signal.

### Token management is a scoped API itself

`GET /api/v1/tokens`, `POST /api/v1/tokens`, and `DELETE /api/v1/tokens/{tokenId}` accept either an administrator access cookie or a PAT with `tokens:manage`. Creation returns `201` with metadata and a one-time `token` field. Listing returns safe cursor-paginated metadata. Revocation returns `204` and keeps the row as audit metadata; repeating it preserves the original timestamp. Unknown UUIDs return a safe `404`.

### Stable opaque cursor pagination

Order tokens by `(createdAt DESC, id DESC)` and encode the pair as an unpadded base64url cursor after schema validation. Fetch `limit + 1` rows to determine the next cursor. Cursors are opaque pagination positions rather than authority-bearing data, so authenticated encryption is unnecessary; malformed cursors return the standard validation response.

### Immediate active-state checks and last-used writes

Bearer authentication computes the HMAC, selects the matching row, and rejects it when revoked or when `now >= expiresAt`. Only an active match updates `lastUsedAt`, before exact-scope authorization, so valid-but-under-scoped usage remains visible. SQLite serialization is sufficient for concurrent timestamp updates, and no token secret participates in an error or log value.

### Transient MobX token-management state

Add a focused `ApiTokenStore` mounted inside the authenticated shell. It fetches safe metadata, submits cookie-authenticated mutations, and holds a newly returned secret only in an observable field that is cleared on dismissal, logout, or component disposal. The UI offers localized scope labels, optional expiration, a copy action, and explicit revocation confirmation. It does not use local/session storage or put the token in URLs.

## Risks / Trade-offs

- [A `tokens:manage` PAT can mint other high-privilege PATs] → Treat `tokens:manage` as explicit token-administrator authority, make scope selection conspicuous, and recommend short expiration for automation that needs it.
- [Frequent authentication writes increase SQLite contention] → Keep the update to one indexed row and accept per-request accuracy for v1's single-process deployment; throttling can be added later without changing the API.
- [A created secret can be lost before copying] → Explain the one-time behavior and require creating a replacement; recoverable token storage is intentionally rejected.
- [Untrusted cursor contents can be malformed] → Strictly decode and validate timestamps/UUIDs, return a generic validation error, and never interpolate cursor values into SQL.
- [UI clipboard access may be unavailable] → Keep the secret selectable while the one-time view is open and surface a safe localized copy failure.

## Migration Plan

1. No schema migration is required because `api_tokens` was created by the storage foundation.
2. Deploy the token service, contracts, routes, and UI together; existing installations start with an empty token list.
3. Rollback removes API/UI access while leaving inert token rows. A later redeploy restores them; deleting rows is unnecessary and would remove useful revocation metadata.
