## Context

See `proposal.md` for motivation. The current panel renders preference controls separately in each authentication state, places token management and introductory identity content directly in the authenticated page, and exposes nodes and clients as consecutive page sections. The shared preference component is also used by the subscription application. Node connection contracts, the SQLite schema, the node domain service, and the wg-easy adapter currently carry a per-node `allowInsecureTls` value down to the HTTPS agent.

The API is strict and OpenAPI-derived, SQLite migrations run with an adjacent pre-migration backup, and the panel supports one process. The change must preserve stored relationships and safe snapshots, must not inspect or modify local `.env` files, and must not introduce sensitive fixtures, recordings, or output.

## Goals / Non-Goals

**Goals:**

- Establish one reusable, authentication-aware panel header and compact preference interactions shared where appropriate with the subscription application.
- Make the two main panel work areas explicit while keeping client inventory's existing inner organization.
- Keep token secrets ephemeral while moving token management out of the main document flow.
- Remove every route by which application code can disable TLS verification.
- Upgrade existing version 1 SQLite databases without losing domain data and with a deterministic fail-closed result for formerly insecure nodes.
- Keep OpenAPI and its generated TypeScript client synchronized with the breaking contract.

**Non-Goals:**

- Persisting the selected outer panel tab or encoding it in the URL.
- Storing or uploading user avatar images.
- Changing the `/api/v1` base path, authentication model, node compatibility version, or synchronization cadence.
- Automatically probing nodes during database migration or automatically provisioning certificates.
- Adding environment variables or reading local environment files during implementation or verification.

## Decisions

### Use state-derived compact controls with pure cycle helpers

The shared UI package will expose two icon-sized actions. Locale state maps directly to `en`/`ru`, and the color scheme maps Mantine's `auto` storage value to the user-facing system state. Pure helper functions will define the closed cycles so their ordering is unit-testable independently of the browser. The locale action will keep the existing cookie and full reload behavior, which ensures server-rendered messages change without adding routing state.

Alternative considered: keep selects or segmented controls and restyle them. This would retain unnecessary persistent labels and would not meet the single-action interaction.

### Compose one panel header around authentication state

The authentication gate will render the same header before its loading, error, setup, login, or authenticated content. It passes the authenticated username only when available. The header derives the uppercase avatar initial locally and owns a menu with the two permitted actions. The existing generated raster logo will be copied into the panel's public assets and rendered without adjacent product text.

Alternative considered: duplicate a header in each state. A common component prevents state-specific drift and makes the all-state requirement directly testable.

### Keep navigation and token-modal ownership at the authenticated shell

The authenticated shell will own an uncontrolled outer tab group defaulting to nodes, so reloads intentionally reset navigation. The token management component becomes a controlled large modal. It creates its store once for the mounted authenticated shell but does not fetch until `opened` becomes true. A Mantine modal stack will coordinate the management, creation, and revocation layers. Closing the root workflow will close subordinate layers, clear the one-time secret, clear draft/confirmation/error state, and return the component to an inert state.

Alternative considered: unmount the token feature on every close. Explicit reset plus a stable store avoids unnecessary wiring churn while providing a testable cleanup boundary; lazy loading remains tied to each open action.

### Remove insecure TLS structurally, not by ignoring it

The field will be removed from strict request schemas, response schemas, generated OpenAPI/client types, MobX form state, database row types, node service inputs, adapter connection types, and transport construction. Because request schemas are strict, legacy JSON bodies fail before network or persistence work. HTTPS agents will always use certificate verification; there will be no boolean branch that can restore `rejectUnauthorized: false`. TLS failures continue through the existing sanitized error classifier.

Alternative considered: retain a deprecated field and force it to false. That would keep an unsafe-looking public contract, allow old clients to believe the flag has effect, and weaken the major-version migration signal.

### Use a data-preserving SQLite table migration with a pre-drop status update

The generated Drizzle migration will first update rows where `allow_insecure_tls` is true to `status = 'tls_error'` and `last_error_code = 'TLS_ERROR'`, then rebuild or alter the nodes table without the column as required by SQLite. No mode, version, successful-sync timestamp, encrypted credential, snapshot, managed client, or placement field is changed. Foreign keys remain enabled and migration tests will exercise real version 1 DDL plus related rows. The existing backup-before-migrate path remains unchanged and runs before this migration.

Alternative considered: leave the unused column indefinitely. Removing it makes the invariant inspectable and prevents future code from accidentally restoring the bypass. Probing during migration was rejected because migrations must be deterministic, offline-capable, and free of credential-bearing network activity.

### Signal compatibility through SemVer while retaining the stable base path

The public API stays under `/api/v1` because the project treats the path as a stable API namespace rather than the package major. The Conventional Commit will carry a breaking-change marker so semantic-release produces `v2.0.0`. OpenAPI generation and drift checks make the removed property visible to consumers.

Alternative considered: introduce `/api/v2`. That would duplicate routing and authentication surfaces solely for one removed property and is outside the agreed compatibility convention.

### Keep privacy verification synthetic and artifact-free

All new adapter, migration, API, and browser cases use generated identifiers and documentation-only hosts. Tests will not read local `.env`, contact a live node, store configuration or QR payloads, or retain screenshots, traces, HAR files, browser storage state, or upstream bodies. The existing log redaction boundary remains unchanged.

## Risks / Trade-offs

- [Formerly insecure HTTPS nodes stop connecting after upgrade] → Mark them fail-closed during migration, preserve safe history, display the existing TLS classification, and require a trusted certificate plus explicit retest.
- [SQLite column removal can disturb foreign-key relationships] → Exercise the migration against version 1 schema data with nodes, snapshots, clients, and placements, then verify foreign keys and records after migration.
- [Hydration can show the wrong theme icon briefly] → Reuse Mantine's color-scheme script/storage and render a hydration-stable system state until client mounting completes.
- [Stacked modals can retain a one-time token in memory] → Centralize close/reset behavior and test reopening after secret display and incomplete mutations.
- [A flag-only locale action is ambiguous to assistive technology] → Provide localized accessible names and tooltips that describe the target locale.
- [Keeping `/api/v1` may surprise consumers expecting URL-version changes] → Document the breaking field removal in OpenAPI, changelog, and the SemVer-major release.

## Migration Plan

1. Build and test the contract, service, adapter, UI, and generated-client changes together so no layer still expects the removed value.
2. Before applying the schema migration at runtime, retain the existing adjacent database backup behavior.
3. In the migration transaction, mark legacy true rows as safe TLS failures, remove the legacy column, and leave all relationships and snapshot data intact.
4. Deploy the `v2.0.0` panel and subscription artifacts. Operators with formerly insecure nodes install trusted certificates and use the existing retest action.
5. Rollback requires restoring the automatic pre-migration backup and running the previous v1 binary; the v2 schema is not modified in place to recreate an operational bypass.
