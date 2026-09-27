# Verification strategy

All automated checks use synthetic identities, RFC 5737/3849 documentation addresses, ephemeral databases, and local mocks. Live-node testing is deliberately outside CI and must never record responses, configurations, QR output, browser state, or logs as repository artifacts.

## Commands

- `pnpm verify` — API drift, formatting, lint, types, unit/integration tests, privacy audit, production builds, and strict OpenSpec validation.
- `pnpm test:coverage` — focused V8 coverage for security/domain/adapters and their state machines.
- `pnpm test:e2e` — production builds plus the self-cleaning Chromium system journey.
- `pnpm test:containers` — panel-only and profiled two-application Compose smoke with cleanup in `finally`.
- `pnpm verify:release` — the complete local release gate.

Playwright uses an OS temporary directory and console-only reporter. Screenshot, video, trace, HAR, download persistence, storage-state output, and HTML reports are disabled. Coverage output is text-only and its working directory is outside the checkout.

## Required scenario matrix

| Scenario                                                                                        | Automated evidence                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Atomic first registration and second-setup rejection                                            | `packages/auth/src/service.test.ts`, `apps/panel/server/api/auth.test.ts`, `e2e/system.spec.ts`                                                                              |
| JWT refresh rotation, concurrent refresh, replay-family revocation, expiry, logout              | `packages/auth/src/service.test.ts`, `apps/panel/server/api/auth.test.ts`                                                                                                    |
| PAT exact scopes, expiry, last-used, one-time reveal, revoke                                    | `packages/auth/src/api-token-service.test.ts`, `apps/panel/server/api/api-tokens.test.ts`                                                                                    |
| Two nodes with identical remote client names remain separate                                    | `packages/nodes/src/sync.test.ts`, `e2e/system.spec.ts`                                                                                                                      |
| Invalid credentials and 2FA/auth rejection                                                      | `packages/wg-easy-adapter/src/adapter.test.ts`, `packages/nodes/src/service.test.ts`                                                                                         |
| Timeout, redirect, oversized response, self-signed TLS, unsupported version, malformed upstream | `packages/wg-easy-adapter/src/transport.test.ts`, `packages/wg-easy-adapter/src/adapter.test.ts`, `packages/wg-easy-adapter/src/schemas.test.ts`                             |
| Partial create/update/delete, explicit retry, ambiguous create, tombstone, remote 404           | `packages/nodes/src/managed.test.ts`                                                                                                                                         |
| Complete WireGuard/AmneziaWG advanced update and lossless retry                                 | `packages/nodes/src/managed.test.ts`, `packages/wg-easy-adapter/src/schemas.test.ts`                                                                                         |
| Adoption, external drift, accept/reapply, missing placement                                     | `packages/nodes/src/managed.test.ts`, `apps/panel/server/api/managed-clients.test.ts`                                                                                        |
| Node deletion blocked by active placement                                                       | `packages/nodes/src/service.test.ts`, `apps/panel/server/api/nodes.test.ts`                                                                                                  |
| Fragment never enters HTTP URL/storage; rotate/revoke invalidates session                       | `apps/subscription/stores/subscription-store.test.ts`, `packages/auth/src/subscription-service.test.ts`, `apps/panel/server/api/subscriptions.test.ts`, `e2e/system.spec.ts` |
| Configuration/QR are live, safe, no-store, absent from SQLite                                   | `packages/nodes/src/delivery.test.ts`, `apps/panel/server/api/delivery.test.ts`, `apps/subscription/server/bff-routes.test.ts`, `e2e/system.spec.ts`                         |
| Russian browser locale, English fallback, no locale route prefix, themes                        | `packages/ui/src/locale.test.ts`, `e2e/system.spec.ts`                                                                                                                       |
| Accessibility smoke on authenticated panel and subscription states                              | `e2e/system.spec.ts` with Axe and role assertions                                                                                                                            |
| Panel-only and panel-plus-subscription rootless containers                                      | `scripts/container-smoke.mjs`                                                                                                                                                |
| No secrets, personal paths, databases, VPN/QR/browser artifacts                                 | `scripts/privacy-audit.mjs`, gitleaks CI, `.gitignore`, `.dockerignore`                                                                                                      |

The coverage threshold applies only to the selected security and domain surface configured in `vitest.config.ts`; UI quality is evaluated by behavior and accessibility rather than an artificial aggregate percentage.
