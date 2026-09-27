## Context

See `proposal.md` for the failure motivation. The panel and subscription applications share a single security-header factory, and both Next.js configurations currently apply its production policy in every runtime. The fix must preserve a secure default because the same helper can be called outside Next.js configuration and production policy regressions would be security-sensitive.

## Goals / Non-Goals

**Goals:**

- Make the CSP mode explicit at the shared header boundary.
- Keep the default and production policies free of `unsafe-eval`.
- Allow both Next.js development runtimes to hydrate without changing API, storage, or authentication behavior.
- Cover the policy split with deterministic unit tests and a synthetic browser smoke check.

**Non-Goals:**

- Replacing the existing static CSP with per-request nonces.
- Relaxing any production directive or changing response caching.
- Changing HMR routing, authentication flows, or persisted data.

## Decisions

### Use an explicit development option with a production-safe default

`browserSecurityHeaders` will accept a development-mode option. Omitting the option will retain the current strict policy. Both Next.js configurations will pass whether `NODE_ENV` is `development`.

This is preferred over reading `NODE_ENV` inside the shared package because the application boundary owns the runtime mode and tests can exercise both variants without mutating global process state. A mode string was considered, but a narrowly named boolean is sufficient for the single controlled relaxation.

### Add only `unsafe-eval` to the development script directive

The policy generator will append `unsafe-eval` to `script-src` only in development. No other directive changes are required for hydration, and the existing `connect-src 'self'` policy supports HMR at the configured same origin.

Disabling CSP entirely in development was rejected because it would hide unrelated policy regressions. Adding `unsafe-eval` unconditionally was rejected because React and Next.js do not require it in production.

### Verify structure and observable hydration

Unit tests will assert that the default/production policy excludes `unsafe-eval`, the development policy includes it, and existing header-copy isolation remains intact. A browser smoke check will use synthetic local configuration and a temporary database outside the repository, then verify that the initial loading view advances to first-admin setup without persisting browser artifacts.

The mode flag and CSP contain no secret-bearing data. Tests will not log environment values, request bodies, cookies, or local database contents.

## Risks / Trade-offs

- [Development pages allow eval-like execution] → Scope the directive to explicit development mode and test that production/default output excludes it.
- [A caller forgets to select development mode] → Update both application configurations in the same change and verify both through type checking/builds.
- [Browser smoke accidentally uses local operational data] → Override configuration with synthetic values and an ephemeral database outside the checkout, and remove it after the check.

## Migration Plan

No data migration is required. Deploying the change leaves production headers unchanged. Rollback consists of reverting the configuration and header-factory changes; persisted state is unaffected.
