## Purpose

Defines safe, lossless, mode-aware inspection and editing of the mutable per-node client settings supported by wg-easy 15.4.0.

## ADDED Requirements

### Requirement: Exact pinned advanced contract
The system SHALL expose every non-shared mutable client field accepted by wg-easy 15.4.0, SHALL use strict request validation, and SHALL exclude immutable identity, keys, telemetry, credentials, configurations, QR payloads, and fields introduced only by later upstream versions.

#### Scenario: WireGuard advanced state is read
- **WHEN** an authorized caller reads an active WireGuard placement
- **THEN** the response contains addresses, DNS, allowed and firewall IPs, MTU, hooks, keepalive, and server endpoint, with null Amnezia values and no sensitive or immutable fields

#### Scenario: Unsupported newer AWG field is submitted
- **WHEN** an update contains `ContentPaddingAddition`, `RekeyAfterTime`, `DisableCookies`, or another unknown field
- **THEN** strict validation rejects it before any upstream mutation

### Requirement: Lossless complete advanced update
The system SHALL merge a complete advanced form with authoritative managed shared fields, persist the full validated desired payload before network I/O, and preserve null, empty, ordered, unedited, and mode-specific values through success, failure, and retry.

#### Scenario: Advanced update succeeds
- **WHEN** a valid complete form is submitted for one active placement
- **THEN** exactly one full wg-easy update is issued for that placement, shared fields remain authoritative, and the placement returns active with complete desired state

#### Scenario: Advanced update fails
- **WHEN** the selected node rejects or cannot complete the update
- **THEN** only that placement becomes error, its complete desired intent remains durable, and retry reapplies the same complete payload

#### Scenario: Shared fields change later
- **WHEN** the managed name or expiration is changed after an advanced update
- **THEN** the complete advanced values remain unchanged while the new shared fields are propagated

### Requirement: Safe hydration
The system SHALL hydrate shared-only placement state from a validated safe remote snapshot before presenting or updating advanced values and SHALL not manufacture defaults when the remote client cannot be confirmed.

#### Scenario: Existing placement has only a shared seed
- **WHEN** its advanced state is first requested
- **THEN** the node is synchronized and the complete mutable state is derived from the validated snapshot

#### Scenario: Known remote client is absent
- **WHEN** synchronization confirms that the placement's remote identifier no longer exists
- **THEN** the placement becomes missing and the advanced request returns a safe conflict without an update

### Requirement: Node-mode enforcement
The system SHALL determine editable Amnezia values from the placement's node mode and SHALL support only the legacy Amnezia fields present in wg-easy 15.4.0.

#### Scenario: WireGuard receives an Amnezia value
- **WHEN** any of `jC`, `jMin`, `jMax`, or `i1` through `i5` is non-null for a WireGuard placement
- **THEN** validation fails before the node is contacted

#### Scenario: AmneziaWG placement is updated
- **WHEN** valid legacy Amnezia values are submitted for an AmneziaWG placement
- **THEN** they are sent and retained without loss alongside the common advanced values

### Requirement: Scoped no-store advanced API
The system SHALL require administrator or `clients:read` access for advanced reads, `clients:write` for updates, browser Origin validation for cookie-authenticated updates, and `Cache-Control: private, no-store` on advanced responses.

#### Scenario: Under-scoped token updates advanced state
- **WHEN** a PAT without `clients:write` sends an advanced update
- **THEN** the API returns `403` before durable or upstream state changes

#### Scenario: Authorized advanced read
- **WHEN** an authorized administrator or `clients:read` PAT reads advanced state
- **THEN** only safe node mode, placement status, and mutable values are returned without cacheable content

### Requirement: Localized mode-aware editor
The panel SHALL provide English and Russian advanced forms for common fields, SHALL hide Amnezia inputs for WireGuard, SHALL show the legacy v15.4.0 section for AmneziaWG, and SHALL explain that newer AWG controls are unavailable under the pinned version.

#### Scenario: WireGuard editor opens
- **WHEN** an administrator edits a WireGuard placement
- **THEN** only common advanced controls are shown and the submitted AWG fields remain null

#### Scenario: AmneziaWG editor opens
- **WHEN** an administrator edits an AmneziaWG placement
- **THEN** the legacy AWG fields and pinned-version compatibility notice are shown without keys or other sensitive values
