## Why

The panel currently exposes only public scaffolding and cannot distinguish its owner from an unauthenticated caller. Before node credentials or client operations are introduced, the control plane needs a race-safe single-administrator bootstrap and durable browser sessions with explicit replay and cross-site protections.

## What Changes

- Add a public setup-status endpoint and an atomic first-administrator registration endpoint; once one administrator exists, all later setup attempts fail with `409`.
- Hash administrator passwords with Argon2id and enforce a documented username/password policy without persisting plaintext credentials.
- Add login, current-admin, refresh, and logout endpoints using a 15-minute access JWT and a rotating 30-day refresh JWT in HttpOnly cookies.
- Persist only hashed refresh-token identifiers, revoke a complete token family when a rotated token is replayed, and make logout idempotent.
- Require a trusted Origin for mutating cookie-authenticated requests and add durable rate limiting for setup, login, and refresh operations.
- Add first-run setup and returning-admin login screens that select the correct state without exposing authentication details to the browser or logs.
- Extend generated OpenAPI/client artifacts with the authentication operations and cookie security declarations.

## Capabilities

### New Capabilities

- `admin-auth`: Single-administrator onboarding, credential verification, secure browser sessions, refresh rotation, replay handling, CSRF protection, rate limiting, and setup/login UI state.

### Modified Capabilities

## Impact

- Adds authentication contracts and routes beneath `/api/v1/auth` plus panel onboarding/login UI.
- Adds an authentication/domain package and cryptographic dependencies for Argon2id and JWT signing/verification.
- Uses the existing `admins`, `refresh_sessions`, and `rate_limits` SQLite tables and may add indexes or session metadata through a migration.
- Extends runtime configuration with the panel's trusted public origin and cookie-security behavior; error responses remain sanitized and secrets remain excluded from logs and generated artifacts.
