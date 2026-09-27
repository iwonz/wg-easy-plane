## 1. Contracts and token domain

- [x] 1.1 Add the fixed scope vocabulary and token request/response/pagination schemas and verify contract validation with `pnpm vitest run packages/contracts/src`.
- [x] 1.2 Implement hash-only PAT generation, exact-scope authentication, expiration, last-used tracking, stable pagination, and idempotent revocation in `packages/auth`; verify with `pnpm vitest run packages/auth/src`.
- [x] 1.3 Add deterministic storage assertions proving plaintext tokens are absent and verify with `pnpm vitest run packages/auth/src`.

## 2. API authorization boundary

- [x] 2.1 Add reusable admin-or-Bearer request-principal middleware with Authorization precedence, exact scope checks, and credential-specific Origin enforcement; verify route integration tests with `pnpm vitest run apps/panel/server`.
- [x] 2.2 Add cursor-paginated `GET /api/v1/tokens`, one-time-secret `POST /api/v1/tokens`, and idempotent `DELETE /api/v1/tokens/{tokenId}` routes; verify cookie and PAT success paths with `pnpm vitest run apps/panel/server`.
- [x] 2.3 Cover malformed, unknown, expired, revoked, and under-scoped PATs plus immediate revocation and last-used updates; verify with `pnpm vitest run apps/panel/server`.

## 3. Generated API surface

- [x] 3.1 Register token routes and security alternatives in OpenAPI, regenerate committed artifacts, and verify zero drift with `pnpm api:check`.
- [x] 3.2 Assert generated types expose token operations without hash fields and verify with `pnpm vitest run packages/api-client/src`.

## 4. Panel token management

- [x] 4.1 Add a MobX token store whose complete secret is transient and verify lifecycle/error behavior with `pnpm vitest run apps/panel/stores`.
- [x] 4.2 Add localized English/Russian Mantine controls for list, create, copy-once, dismiss, and confirmed revoke with no locale route prefix; verify the panel tests and production build with `pnpm vitest run apps/panel && pnpm --filter @wg-easy-plane/panel build`.
- [x] 4.3 Exercise setup/login, token creation, one-time dismissal, reload, and revocation in a real browser using only synthetic data; verify URLs/network output contain no PAT and delete all Playwright artifacts afterward.

## 5. Security and repository verification

- [x] 5.1 Run formatting, lint, TypeScript, unit/integration tests, and production builds with `pnpm verify` and fix every failure.
- [x] 5.2 Run `openspec validate add-scoped-api-tokens --strict`, gitleaks, and a targeted privacy scan; verify no credentials, complete PATs, databases, logs, screenshots, or recordings are tracked.
- [x] 5.3 Review the final diff and Git status, mark every completed task, and verify only this change's intended files remain before the Conventional Commit.
