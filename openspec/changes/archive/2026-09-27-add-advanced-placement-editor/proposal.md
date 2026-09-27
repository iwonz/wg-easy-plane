## Why

Managed clients currently expose only shared lifecycle fields, so an administrator cannot safely inspect or change the per-node WireGuard and AmneziaWG settings that wg-easy 15.4.0 actually accepts. The editor must preserve the full desired payload, respect node mode, and avoid inventing fields that the pinned upstream release cannot process.

## What Changes

- Add strict read and update contracts for every non-shared mutable client field accepted by wg-easy 15.4.0.
- Hydrate advanced values from the last validated remote snapshot and persist a complete desired update payload before each upstream attempt.
- Enforce node mode: WireGuard placements reject non-null AmneziaWG values; AmneziaWG placements expose and preserve `jC`, `jMin`, `jMax`, and `i1` through `i5`.
- Keep immutable identity, key material, credentials, telemetry, configurations, and QR payloads outside the editor and its API.
- Add a localized, mode-aware Mantine editor with a pinned-version compatibility notice.
- Explicitly exclude newer AWG 3.0/3.1 fields such as `ContentPaddingAddition`, `RekeyAfterTime`, and `DisableCookies`: they are absent from the wg-easy 15.4.0 client database and update schema and therefore cannot be sent safely.
- Regenerate the typed OpenAPI client and add contract, domain, route, store, and browser coverage.

## Capabilities

### New Capabilities

- `advanced-placement-editor`: Safe per-placement inspection and update of the complete mutable wg-easy 15.4.0 client contract.

### Modified Capabilities

- `managed-client-lifecycle`: Retry and shared-field propagation continue to use the complete advanced desired payload without losing null, empty, or mode-specific values.

## Impact

- Extends shared contracts, OpenAPI routes, generated client, managed-client domain service, MobX state, localized panel UI, and synthetic tests.
- Uses the existing placement desired-state JSON and operation-attempt tables without a database migration.
- Keeps the integration pinned to the exact v15.4.0 API surface; adding later AmneziaWG generations requires a separately reviewed upstream-version change.
