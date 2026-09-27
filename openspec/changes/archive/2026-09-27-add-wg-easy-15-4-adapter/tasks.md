## 1. Pinned contract package

- [x] 1.1 Add `packages/wg-easy-adapter` with version and mode schemas derived from the official v15.4.0 source; verify with `pnpm --filter @wg-easy-plane/wg-easy-adapter typecheck`.
- [x] 1.2 Add strict raw inventory, safe client projection, create, full-update, success, and artifact schemas; verify valid and malformed synthetic fixtures with `pnpm vitest run packages/wg-easy-adapter/src`.
- [x] 1.3 Add RFC documentation-range JSON fixtures and verify a privacy scan finds no live endpoints, credentials, configs, QR payloads, or response recordings.

## 2. Constrained transport

- [x] 2.1 Implement bounded Node HTTP(S) transport with 10-second default timeout, no redirect following, per-instance TLS verification, and no credential-bearing URLs; verify local mock-server tests with `pnpm vitest run packages/wg-easy-adapter/src`.
- [x] 2.2 Add Basic Authorization only for protected calls and verify mock servers receive the expected header while serialized adapter state and errors never contain it.
- [x] 2.3 Map timeout, TLS, unreachable, redirect, oversized, authentication, not-found, and generic upstream responses to sanitized stable errors; verify error tests contain no raw body, URL, username, or password.

## 3. Adapter operations

- [x] 3.1 Implement information, exact 15.4.0 compatibility gate, WireGuard/AmneziaWG detection, and authenticated probe; verify supported, unsupported, malformed, invalid-credential, and synthetic 2FA-rejection cases.
- [x] 3.2 Implement client list/create/full-update/enable/disable/delete operations with compatibility-before-mutation; verify paths, methods, exact request bodies, and no mutation on failed compatibility.
- [x] 3.3 Implement ephemeral configuration and QR retrieval with media-type, size, and SVG safety validation; verify payloads are returned only from method results and unsafe artifacts fail closed.

## 4. Repository verification

- [x] 4.1 Run package tests and typecheck, then run `pnpm verify`; fix every formatting, lint, type, unit/integration, OpenAPI drift, build, or OpenSpec failure.
- [x] 4.2 Run `openspec validate add-wg-easy-15-4-adapter --strict`, gitleaks, and targeted privacy/artifact scans; verify only synthetic data is present.
- [x] 4.3 Review the staged diff, mark all tasks complete, and verify a clean task-scoped status before the Conventional Commit.
