## Why

Feature work needs a reproducible TypeScript monorepo with independent panel and subscription applications and shared presentation conventions. Establishing localization, theming, state ownership, and CI now prevents later changes from inventing incompatible foundations.

## What Changes

- Add a Node.js 24 pnpm workspace orchestrated by Turborepo.
- Add minimal `panel` and `subscription` Next.js applications.
- Add shared Mantine theme and provider components plus MobX client-state patterns.
- Add English and Russian next-intl messages without locale path prefixes.
- Add baseline formatting, linting, type checking, unit testing, builds, and CI.

## Capabilities

### New Capabilities

- `application-shell`: Defines the common application runtime, theme, localization, and client-state behavior.

### Modified Capabilities

None.

## Impact

- Introduces the JavaScript workspace, lockfile, two applications, shared packages, and CI dependencies.
- Adds only placeholder product pages; business APIs and persistence remain out of scope.
