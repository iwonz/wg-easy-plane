## 1. Safe state comparison and sync classification

- [x] 1.1 Add shared exact mutable-state projection, durable parsing, stable comparison, and safe diff helpers.
- [x] 1.2 Reconcile linked placements as active, drift, or missing in the successful inventory transaction without changing complete desired state.
- [x] 1.3 Hydrate shared-only seeds during successful sync and preserve all placement state on failed sync.

## 2. Adoption and resolution domain

- [x] 2.1 Add atomic adoption validation for current unlinked selections with at most one remote per node and no upstream mutation.
- [x] 2.2 Add safe drift inspection with fixed fields, freshness, desired state, and nullable remote state.
- [x] 2.3 Add local accept-remote resolution with managed shared-field propagation and all-placement reclassification.
- [x] 2.4 Add selected-placement reapply-desired and explicit missing recreation through existing safe state machines.

## 3. Typed API and panel experience

- [x] 3.1 Add strict adoption/drift schemas, scoped no-store routes, generated client updates, and route tests.
- [x] 3.2 Extend the MobX inventory store with adoption, inspection, accept, reapply, and recreate actions plus tests.
- [x] 3.3 Build localized Mantine adoption selection, safe diff, resolution, and missing-recovery UI.
- [x] 3.4 Exercise adoption, external drift, accept/reapply, and missing recreation against synthetic nodes in a real browser without persisted artifacts.

## 4. Verification and delivery

- [x] 4.1 Pass strict OpenSpec validation, deterministic OpenAPI generation, formatting, lint, typecheck, unit/integration tests, and production builds.
- [x] 4.2 Run privacy and secret scans, inspect the diff, archive the change, fast-forward merge it to clean `master`, smoke-check, push, and remove the task branch.
