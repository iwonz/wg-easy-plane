## 1. Pinned contract and API

- [x] 1.1 Add strict safe advanced value, response, and update schemas for the exact wg-easy 15.4.0 mutable fields.
- [x] 1.2 Add adapter contract fixtures proving the pinned fields round-trip and newer edge-only AWG fields are rejected.
- [x] 1.3 Add scoped GET/PATCH placement routes, no-store responses, OpenAPI generation, and route tests.

## 2. Domain behavior

- [x] 2.1 Add lossless advanced serialization and shared-seed hydration with null and empty-value coverage.
- [x] 2.2 Return safe conflicts and missing state when hydration confirms the remote client is absent.
- [x] 2.3 Persist complete desired state before one-placement update attempts and retain it across failure and retry.
- [x] 2.4 Enforce WireGuard versus AmneziaWG mode and legacy v15.4.0 field bounds before upstream mutation.

## 3. Panel experience

- [x] 3.1 Extend the inventory MobX store with typed advanced read/update state and tests.
- [x] 3.2 Build localized Mantine common advanced controls with explicit nullable-list behavior.
- [x] 3.3 Show legacy AWG controls only for AmneziaWG placements with the pinned-version compatibility notice.
- [x] 3.4 Exercise WireGuard and AmneziaWG editors against synthetic nodes in a real browser without persisted artifacts.

## 4. Verification and delivery

- [x] 4.1 Regenerate the API client and pass strict OpenSpec validation, formatting, lint, typecheck, unit/integration tests, and production builds.
- [x] 4.2 Run privacy and secret scans, inspect the diff, archive the change, fast-forward merge it to clean `master`, smoke-check, push, and remove the task branch.
