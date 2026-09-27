## 1. Compact shared application controls

- [x] 1.1 Replace the shared locale selector with a current-flag action and a pure `en`/`ru` cycle while preserving cookie reload behavior; verify with UI unit tests for both transition directions.
- [x] 1.2 Replace the shared theme segmented control with a current-state icon action and a pure `system → light → dark → system` cycle using Mantine persistence; verify with UI unit tests and application type-checks.
- [x] 1.3 Update panel and subscription translations and layout usage for accessible compact controls; verify both English and Russian render without locale-prefixed routes in Playwright.

## 2. Panel shell and token workflow

- [x] 2.1 Build the common all-state panel header with the existing logo, compact controls, local username initial, and exact avatar menu; verify setup, login, error, and authenticated header states in component and Playwright checks.
- [x] 2.2 Remove the first-run badge and introductory authenticated card, shorten setup submit copy, and add outer Nodes/Clients tabs defaulting to Nodes while retaining inner client tabs; verify the panel Playwright flow.
- [x] 2.3 Convert API token management into a controlled large modal with stacked create/revoke dialogs, lazy list loading, and complete close-time transient reset; verify token store/component tests and the authenticated Playwright flow.

## 3. Trusted-only node contract and adapter

- [x] 3.1 Remove `allowInsecureTls` from strict node request/response schemas, OpenAPI, and generated client; verify valid field-free API requests pass, legacy properties return `400`, and `pnpm api:check` reports no drift.
- [x] 3.2 Remove insecure TLS state and controls from panel MobX and node forms while preserving `tls_error` presentation; verify node UI unit tests and type-checks.
- [x] 3.3 Remove insecure TLS options and metadata from node services and adapter connection types, force certificate verification in HTTPS transport, and preserve sanitized certificate error mapping; verify node and adapter unit/integration tests.

## 4. Data-preserving SQLite migration

- [x] 4.1 Remove `allow_insecure_tls` from the Drizzle node schema and generate the next migration and metadata; verify the generated schema diff contains the intended column removal.
- [x] 4.2 Amend the migration to mark legacy true rows `tls_error` / `TLS_ERROR` before removing the column while leaving false rows unchanged; verify the migration SQL review and database type-check.
- [x] 4.3 Add a real version 1 migration integration fixture with trusted and formerly insecure nodes plus related snapshot/client/placement records; verify migration tests prove column removal, fail-closed status, relationship preservation, foreign keys, and backup-before-migrate behavior.

## 5. Cross-surface verification

- [x] 5.1 Update synthetic API, service, adapter, UI, and E2E fixtures for the trusted-only contract and add the required setup/login/error, theme/locale, tabs, avatar, token modal, logout, and accessibility scenarios; verify targeted test commands pass without live systems or retained browser artifacts.
- [x] 5.2 Run `openspec validate refine-panel-shell-and-enforce-trusted-tls --strict`, formatting, lint, type-check, unit/integration tests, coverage, E2E, API drift, production builds, container smoke, actionlint, gitleaks, and the repository privacy audit; verify every command exits successfully.

## 6. Release workflow

- [x] 6.1 Review the final diff for secrets, local endpoints, database files, configurations, QR payloads, screenshots, recordings, and `.env` changes; verify `git status`, gitleaks, and privacy audit show only intended safe files.
- [x] 6.2 Commit the implementation with a breaking `feat!` Conventional Commit, archive and strictly validate the OpenSpec change, and commit the archive; verify the branch history and clean worktree.
- [x] 6.3 Fast-forward the verified branch into clean `master`, run the post-merge smoke check, push, and verify GitHub publishes release `v2.0.0` and both GHCR images before deleting the branch; verify remote release/package state and final clean `master`.
