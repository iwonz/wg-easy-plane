## 1. Contracts and safe fetch boundary

- [x] 1.1 Add strict sync-run, discovered-client, pagination, and route schemas; verify contract tests and regenerated OpenAPI/client output contain no secret-bearing fields.
- [x] 1.2 Extend the node service with a stored-node safe inventory fetch that preserves prior metadata on failure; verify adapter-factory tests cover success, timeout, authentication, TLS, unsupported version, malformed response mapping, and credential non-disclosure.
- [x] 1.3 Add canonical safe snapshot serialization and hashing; verify tests reject unknown stored fields and omit endpoint, one-time link, configuration, QR, and arbitrary upstream data.

## 2. Synchronization domain

- [x] 2.1 Implement run lifecycle and atomic inventory reconciliation with first/last-seen and missing semantics; verify synthetic SQLite tests cover insert, update, empty inventory, reappearance, duplicate names across nodes, and transactional `last_synced_at`.
- [x] 2.2 Preserve snapshots and successful timestamps on every failed fetch while recording safe failure metadata; verify database assertions cover transport, auth, TLS, version, contract, and unexpected failures.
- [x] 2.3 Add process-local per-node exclusion and stale-running-run recovery; verify concurrent calls produce one upstream request and a safe conflict while interrupted runs close without sensitive data.

## 3. Lease and scheduler

- [x] 3.1 Implement atomic acquire/refresh/release behavior for the expiring SQLite scheduler lease; verify deterministic tests cover current holder, competing holder, and expired takeover.
- [x] 3.2 Add the lazy unref'ed interval scheduler with the configured default and zero-disable behavior; verify fake timer/service tests cover periodic cycles, no overlap, lease skipping, and no timer at zero.
- [x] 3.3 Compose one scheduler in the cached panel runtime and trigger safe synchronization after healthy node creation; verify runtime and node API integration tests observe immediate sync only for healthy creates.

## 4. Scoped API and generated client

- [x] 4.1 Add `POST /api/v1/nodes/{nodeId}/sync` with `nodes:write`, cookie Origin enforcement, no-store response, and safe conflict/error mapping; verify cookie and PAT authorization tests.
- [x] 4.2 Add cursor-paginated `GET /api/v1/clients/discovered` with `clients:read`; verify identity, ordering, missing/freshness fields, malformed cursor, and under-scoped PAT tests.
- [x] 4.3 Regenerate OpenAPI 3.1 and the typed client; verify `pnpm api:check` reports no drift and API schemas expose no credentials, endpoints, raw response content, configuration, or QR payloads.

## 5. Localized panel UI

- [x] 5.1 Add a MobX discovered-inventory store and node manual-sync action; verify unit tests cover page loading, same-name separation, missing state, successful refresh, safe errors, and no browser persistence.
- [x] 5.2 Add localized Mantine Managed/Discovered presentation for the current read-only inventory and manual sync controls; verify the critical browser flow against two synthetic same-name mock-node records.
- [x] 5.3 Add the global compatibility warning derived only from safe node statuses; verify English/Russian rendering, English fallback, route stability, accessibility smoke, and absence of sensitive values in DOM, URL, browser storage, screenshots, or recordings.

## 6. Repository verification

- [x] 6.1 Run `pnpm verify`; fix every formatting, lint, type, test, OpenAPI drift, build, and OpenSpec failure.
- [x] 6.2 Run `openspec validate add-sync-and-client-inventory --strict`, gitleaks, and targeted privacy/artifact scans; verify only synthetic documentation-range node and client data exists.
- [x] 6.3 Review the staged task-scoped diff, mark every task complete, and verify clean index/worktree boundaries before the Conventional Commit.
