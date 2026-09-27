## 1. Node contracts and credential protection

- [x] 1.1 Add strict node input, metadata, status, pagination, and route contracts; verify contract tests and regenerated OpenAPI/client output.
- [x] 1.2 Add `packages/nodes` with HKDF-derived field-bound AES-256-GCM credential encryption; verify round-trip, random-IV, wrong-node, wrong-field, tamper, and serialized-row privacy tests.
- [x] 1.3 Add node validation, pagination, CRUD, duplicate detection, and placement-protected deletion; verify package service tests against a migrated synthetic SQLite database.

## 2. Probing and status lifecycle

- [x] 2.1 Integrate the pinned adapter through an injectable factory and map every stable adapter result to safe node status; verify healthy, unreachable, auth/2FA, TLS, unsupported-version, malformed, redirect, and generic failures.
- [x] 2.2 Probe on create and connection-setting updates while retaining omitted credentials and skipping probes for display-name-only edits; verify exact factory inputs, timestamps, safe metadata, and no upstream mutations.
- [x] 2.3 Add unsaved connection testing and stored-node retesting with prior safe mode/version preservation; verify the unsaved test creates no row and retest updates only safe status fields.

## 3. Scoped API and generated client

- [x] 3.1 Register node routes and runtime service with `nodes:read`/`nodes:write`, Origin enforcement, no-store responses, and safe error envelopes; verify cookie and PAT authorization integration tests.
- [x] 3.2 Verify API tests cover create/list/detail/update/test/delete, validation, duplicate conflict, missing node, failed probes, retained credentials, and placement deletion conflict without leaking supplied credentials.
- [x] 3.3 Regenerate OpenAPI 3.1 and the typed client; verify `pnpm api:check` reports no drift and schemas contain no credential fields in responses.

## 4. Localized panel UI

- [x] 4.1 Add a MobX node store for safe list/create/update/test/delete state and verify request shapes, failure mapping, pagination, and absence of browser persistence in unit tests.
- [x] 4.2 Add localized Mantine node list and add/edit/test/delete modals with empty edit credentials and persistent insecure-TLS warnings; verify production typecheck/build and critical browser flow against synthetic mock behavior.
- [x] 4.3 Verify English fallback, Russian translations, accessible labels, password clearing, and absence of credentials in URLs, local storage, session storage, screenshots, or recordings.

## 5. Repository verification

- [x] 5.1 Run `pnpm verify`; fix every formatting, lint, type, test, OpenAPI drift, build, and OpenSpec failure.
- [x] 5.2 Run `openspec validate add-node-management --strict`, gitleaks, and targeted privacy/artifact scans; verify only synthetic documentation-range node data exists.
- [x] 5.3 Review the staged task-scoped diff, mark every task complete, and verify clean index/worktree boundaries before the Conventional Commit.
