## Context

The initial storage change already created `admins`, `refresh_sessions`, and `rate_limits`, but no service owns their security invariants and the Hono API currently has only a public system endpoint. The panel is a deliberate single-process deployment backed by synchronous SQLite, so atomic setup and refresh rotation can use immediate SQLite transactions without a distributed lock. See `proposal.md` for motivation and `specs/admin-auth/spec.md` for observable behavior.

## Goals / Non-Goals

**Goals:**

- Keep password hashing, JWT/key handling, session rotation, and rate-limit rules in a framework-independent package with deterministic test seams for clocks and random identifiers.
- Make the first-admin race and refresh one-time use transactional at the database boundary.
- Keep JWTs in cookies only, hashes in SQLite only, and all errors/loggable values free of credentials or token material.
- Expose the same Zod schemas to Hono handlers, OpenAPI generation, the generated client, and UI calls.

**Non-Goals:**

- Multiple administrators, roles, password reset, account recovery, 2FA, OIDC, or API PATs.
- Immediate revocation of an already-issued 15-minute access JWT; logout revokes refresh capability and clears browser cookies.
- Trusting proxy-supplied client IP headers. Rate-limit keys use keyed hashes of operation-specific identities until proxy trust is designed explicitly.

## Decisions

### Isolated authentication package

Add `packages/auth` with an `AuthService` that receives a database connection, the master encryption key, clock, and UUID source. API handlers translate typed HTTP requests into this service and own only cookies/status codes. This keeps cryptographic and transaction behavior unit/integration-testable without Next.js. Keeping the implementation directly in route handlers was rejected because it would make race/replay tests dependent on HTTP details and encourage duplicated security logic.

### Argon2id password storage

Use `@node-rs/argon2` with Argon2id, a 19 MiB memory cost, two iterations, one lane, and a 32-byte output. These parameters meet the intended interactive single-admin threat model while remaining practical on small control-plane hosts. An unknown username still performs an Argon2id verification against a process-local synthetic hash so the response and expensive-work shape do not disclose account existence. PBKDF2 and bcrypt were rejected because the plan explicitly requires Argon2id.

### HKDF-separated authentication keys

Derive independent 32-byte keys from `APP_ENCRYPTION_KEY` using HKDF-SHA-256 with versioned `auth/jwt-signing`, `auth/refresh-id`, and `auth/rate-limit-key` info labels. JWTs use HS256 with fixed issuer/audience and explicit `type`, `sub`, `sid`, `jti`, `iat`, and `exp` claims. Refresh identifiers and rate-limit identities are stored as HMAC-SHA-256 digests, never raw values. Reusing the master key directly or sharing one derived key across purposes was rejected to preserve cryptographic domain separation.

### Atomic setup and refresh rotation

Setup executes `BEGIN IMMEDIATE`, checks the administrator count, inserts the only administrator, and creates the initial refresh record before commit. The database's unique constraints are a second guard. Refresh verification occurs before a second immediate transaction loads the hashed identifier: an active row is marked rotated and its successor inserted atomically; a rotated row causes every row in its family to be revoked before returning unauthorized. SQLite serializes concurrent writers, so only one request can consume a refresh identifier. Best-effort non-transactional rotation was rejected because two callers could both receive valid successors.

### Cookie and Origin boundary

The access and refresh JWTs use distinct HttpOnly, Secure, SameSite=Lax cookies with `Path=/`; max ages mirror their 15-minute and 30-day expirations. Mutating auth endpoints compare the parsed request `Origin` exactly to `PANEL_PUBLIC_URL.origin` before reading credentials or changing state. `PANEL_PUBLIC_URL` becomes required runtime configuration so this check fails during configuration validation instead of trusting `Host` or forwarded headers. JWTs are never placed in JSON, URLs, local storage, or logs.

### Persistent bounded-window rate limiting

Use the existing `rate_limits` table with one atomic upsert per attempt. Setup uses a global key, login uses an HMAC of the normalized username, and refresh uses an HMAC of its verified identifier (or a fixed invalid-token key). Windows and limits are constants local to the auth package; successful login clears its current bucket. Add indexes for refresh family revocation and expired rate-limit cleanup. In-memory limiting was rejected because process restarts would erase protection.

### API factory and lazy production dependencies

Refactor the Hono app into `createApi(dependencies)` so integration tests inject an isolated auth service. The exported production app resolves configuration and a singleton SQLite connection lazily on the first auth request, avoiding secret/database access during OpenAPI code generation. Deployment still runs migrations explicitly before the panel; the later container change will make this an entrypoint guarantee.

### Client-side authentication entry state

The root panel page becomes a small MobX-backed client state machine. It reads setup status and current-admin state, renders localized Mantine setup/login forms, submits only same-origin fetches, and renders the existing shell after authentication. Refresh is attempted once after an unauthorized current-admin request. This keeps locale routes unchanged and avoids embedding session tokens in rendered HTML.

## Risks / Trade-offs

- [A stolen access JWT remains usable for at most 15 minutes after logout] → Keep access lifetime short, never expose it to JavaScript, and add server-side revocation only if the threat model later requires it.
- [Argon2 can exhaust memory under attack] → Rate-limit before repeated verification, cap request body fields, use bounded parameters, and keep the panel single-process.
- [A replay race revokes the winner's newly issued refresh token] → Treat any reuse as family compromise; the user must log in again, which is safer than attempting to identify the legitimate racer.
- [Required `PANEL_PUBLIC_URL` adds setup configuration] → Document it in `.env.example` and return only a generic configuration failure; never infer trust from attacker-controlled headers.
- [SQLite rate-limit rows accumulate] → Reuse fixed keys/buckets and opportunistically delete expired rows during limit checks; add an index on reset time.

## Migration Plan

1. Add indexes through a new Drizzle migration; existing installations retain all current rows.
2. Require `PANEL_PUBLIC_URL` before deploying the new panel build and run the migration command with its existing backup-before-migrate behavior.
3. Deploy the API/UI. An empty database presents setup; an existing administrator presents login.
4. Rollback can restore the pre-migration database backup; the added indexes are otherwise backward-compatible and contain no new secret material.
