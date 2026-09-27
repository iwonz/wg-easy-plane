## 1. Configuration and Storage

- [x] 1.1 Require and validate `PANEL_PUBLIC_URL`, document the inert environment example, and verify config unit tests cover trusted-origin parsing and redacted failures
- [x] 1.2 Add refresh-family and rate-limit indexes through a Drizzle migration and verify migration/database tests pass on a temporary SQLite database

## 2. Authentication Domain

- [x] 2.1 Add the authentication package with Argon2id hashing and HKDF-separated JWT/hash keys; verify unit tests cover password policy, claims, expiry, and non-plaintext persistence
- [x] 2.2 Implement atomic setup, login, current-admin verification, refresh rotation/replay family revocation, and idempotent logout; verify integration tests cover first-setup races, concurrent refresh, replay, expiry, and revocation
- [x] 2.3 Implement persistent setup/login/refresh rate limits with hashed identities and verify tests cover threshold, reset, successful-login cleanup, and persistence across reopened database connections

## 3. Typed HTTP API

- [x] 3.1 Add shared auth request/response schemas and OpenAPI routes for setup status, setup, login, refresh, logout, and current admin; verify contract tests and generated types contain every operation
- [x] 3.2 Add lazy production dependencies, exact Origin validation, secure cookie issuance/clearing, and safe error mapping to the Hono API; verify route integration tests cover cookie flags, CSRF rejection, validation, unauthorized access, rotation, replay, and rate limiting

## 4. Panel Entry UI

- [x] 4.1 Add localized Mantine setup/login/authenticated states with a MobX state machine and one refresh attempt; verify component/state tests cover transitions and no locale appears in routes
- [x] 4.2 Run a real-browser smoke against an isolated synthetic database and verify first setup, logout, returning login, English fallback, Russian locale, and absence of tokens in URLs or browser artifacts

## 5. Verification

- [x] 5.1 Regenerate OpenAPI/client artifacts and run `pnpm verify`, `openspec validate add-admin-onboarding-auth --strict`, gitleaks, and a targeted privacy scan; verify the worktree contains no database, credential, cookie, JWT, screenshot, trace, or storage-state artifacts
