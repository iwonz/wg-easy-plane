## Context

The repository currently contains governance and OpenSpec artifacts but no package manager metadata or runtime code. The two applications must evolve independently while sharing visual and configuration foundations.

## Goals / Non-Goals

**Goals:**

- Pin a reproducible Node.js and pnpm toolchain.
- Keep the applications independently deployable.
- Establish server-safe localization and client-state patterns.
- Provide one aggregate verification entry point.

**Non-Goals:**

- Define database, API, authentication, or wg-easy integration behavior.
- Add production Docker images.
- Add live browser workflows beyond a minimal render smoke test.

## Decisions

### pnpm workspaces with Turborepo

pnpm supplies a strict shared lockfile and workspace linking; Turborepo provides dependency-aware scripts and caching. A custom task runner was rejected as unnecessary maintenance.

### Two application packages

`apps/panel` and `apps/subscription` own their routes and runtime configuration. Shared theme components live in `packages/ui`; common TypeScript and lint conventions remain at the root.

### next-intl without routing middleware

Locale resolution uses a safe locale cookie when present, otherwise `Accept-Language`, with English fallback. No route segment or redirect is introduced.

### Provider-scoped MobX stores

Client stores are created inside a React provider. Module-level singleton stores were rejected because they can leak request state during server rendering.

## Risks / Trade-offs

- [Shared UI code becomes too coupled] -> Keep packages presentation-only and let each app own its routes.
- [Framework versions drift] -> Pin exact versions and commit the pnpm lockfile.
- [Locale parsing differs between apps] -> Share a small locale resolver from the UI package and cover it with unit tests.
- [CI is slow] -> Use pnpm and Turborepo caches without skipping correctness checks.

## Migration Plan

No data migration is required. Both applications start as independently buildable placeholder shells.
