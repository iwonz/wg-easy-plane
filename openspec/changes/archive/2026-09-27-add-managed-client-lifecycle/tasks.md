## 1. Contracts and mutation boundary

- [x] 1.1 Add strict managed-client, placement, candidate, pagination, and lifecycle route contracts; verify contract tests and generated OpenAPI contain only safe metadata.
- [x] 1.2 Extend the credential-contained node mutation boundary for create, complete update, enable, disable, and delete; verify compatibility gating, exact adapter inputs, remote `404`, safe status mapping, and credential non-disclosure.
- [x] 1.3 Add strict shared desired seeds and complete update hydration from safe snapshots; verify common-field overrides preserve every other adapter update field.

## 2. Managed lifecycle domain

- [x] 2.1 Implement managed-client and placement persistence, cursor listing, and state serialization; verify UUID identity, one-placement-per-node, pagination, and safe response tests.
- [x] 2.2 Implement best-effort multi-node and add-placement creation; verify all-success, partial definitive failure, incompatible node, retained success, attempt history, and post-create snapshot hydration.
- [x] 2.3 Implement common name/expiration update and enable/disable propagation; verify partial outcomes, desired-state retention, missing snapshot behavior, and no rollback.
- [x] 2.4 Implement placement removal and managed tombstone deletion; verify remote `404`, partial deletion, retained tombstone, final local removal, and no implicit deletion outside selected placements.
- [x] 2.5 Implement durable retry dispatch; verify create/update/toggle/delete retries affect only the selected placement and already successful placements are untouched.

## 3. Ambiguous create recovery

- [x] 3.1 Classify create timeout as ambiguous and trigger a safe sync without blind retry; verify one upstream create call, ambiguous attempt state, and preserved local record.
- [x] 3.2 Add safe candidate listing, explicit link, and local cancellation; verify node scoping, name matching, placement uniqueness, desired hydration, conflict responses, and zero upstream mutation during link/cancel.

## 4. Scoped API and inventory separation

- [x] 4.1 Register managed list/detail/create/update/enable/disable/delete routes with exact `clients:read`/`clients:write`, Origin enforcement, and no-store responses; verify cookie and PAT integration tests.
- [x] 4.2 Register add/remove/retry/candidate/link/cancel placement routes with safe status codes and error envelopes; verify authorization, validation, not-found, conflict, partial-success, and tombstone cases.
- [x] 4.3 Exclude linked snapshots from Discovered reads without deleting them; verify API pagination and same-name node-scoped tests.
- [x] 4.4 Regenerate OpenAPI 3.1 and the typed client; verify `pnpm api:check` has no drift or secret-bearing response fields.

## 5. Localized panel UI

- [x] 5.1 Add a MobX managed-client store for lifecycle and placement actions; verify unit tests cover request shapes, partial outcomes, retries, ambiguous decisions, pagination, and no persistence.
- [x] 5.2 Replace the Managed placeholder with localized Mantine create/edit/toggle/delete and node-placement controls; verify critical browser flow across two synthetic mock nodes with a partial failure.
- [x] 5.3 Add placement status, tombstone, and ambiguous candidate presentation; verify English/Russian rendering, accessible controls, route stability, and absence of credentials, config, QR, or upstream bodies in browser storage and artifacts.

## 6. Repository verification

- [x] 6.1 Run `pnpm verify`; fix every formatting, lint, type, test, OpenAPI drift, build, and OpenSpec failure.
- [x] 6.2 Run `openspec validate add-managed-client-lifecycle --strict`, gitleaks, and targeted privacy/artifact scans; verify only synthetic documentation-range data exists.
- [x] 6.3 Review the staged task-scoped diff, mark every task complete, and verify clean index/worktree boundaries before the Conventional Commit.
