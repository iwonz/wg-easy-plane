## Purpose

Defines explicit adoption of discovered clients and safe operator-directed detection and resolution of remote drift or disappearance.

## ADDED Requirements

### Requirement: Explicit node-scoped adoption
The system SHALL create one managed client from one or more explicitly selected current unlinked remote clients, SHALL allow at most one selection per node, SHALL persist a complete desired state per placement, and SHALL perform no upstream mutation during adoption.

#### Scenario: Multiple remotes are adopted
- **WHEN** an administrator confirms one current unlinked remote client from each of two distinct nodes with common managed fields
- **THEN** one managed client and two linked placements are created atomically and the remote clients receive no create, update, toggle, or delete request

#### Scenario: Matching names are not selected
- **WHEN** discovered clients on different nodes happen to share a name
- **THEN** none is grouped or adopted until its exact node and remote identifier is explicitly submitted

#### Scenario: Duplicate node or linked candidate is submitted
- **WHEN** adoption contains two clients from one node or a candidate already linked to a placement
- **THEN** the request fails before creating any managed row or mutating upstream

### Requirement: Complete-sync placement classification
The system SHALL classify every known linked placement on a node only after a complete compatible sync, SHALL mark exact mutable-state matches active, differences drift, and confirmed absence missing, and SHALL not overwrite complete desired state.

#### Scenario: External mutable change is discovered
- **WHEN** a successful sync returns a known remote client whose full mutable state differs from durable desired state
- **THEN** the placement becomes drift and its desired payload remains byte-for-byte semantically unchanged

#### Scenario: Remote client disappears
- **WHEN** a complete successful sync omits a known placement remote identifier
- **THEN** the placement becomes missing with a stable safe code

#### Scenario: Synchronization fails
- **WHEN** a node cannot produce a complete compatible inventory
- **THEN** its existing placement classifications and desired payloads remain unchanged

#### Scenario: Shared-only seed is synchronized
- **WHEN** a known placement still has a shared desired seed and a current validated snapshot appears
- **THEN** the system hydrates a complete desired payload from remote advanced fields plus managed common fields before classifying it

### Requirement: Safe exact drift inspection
The system SHALL expose desired and current remote mutable state plus ordered changed fields from the exact pinned update contract, SHALL expose snapshot freshness, and SHALL exclude immutable, secret, telemetry, delivery, node-address, and raw upstream values.

#### Scenario: Drift is inspected
- **WHEN** an authorized caller reads a drift placement
- **THEN** it receives only fixed safe field names and safe desired/remote values for actual differences

#### Scenario: Missing placement is inspected
- **WHEN** an authorized caller reads a confirmed missing placement
- **THEN** desired state is returned, remote state is null, and no defaults are fabricated

### Requirement: Explicit drift resolution
The system SHALL provide separate accept-remote and reapply-desired actions, SHALL never resolve drift automatically, and SHALL isolate upstream mutation to the selected placement.

#### Scenario: Remote state is accepted
- **WHEN** the administrator accepts the current remote state of one placement
- **THEN** its advanced values become desired, its remote shared values become the managed common fields, every placement desired payload receives those common fields, all placements are reclassified locally, and no upstream request occurs

#### Scenario: Desired state is reapplied
- **WHEN** the administrator explicitly reapplies a placement's durable desired state
- **THEN** one complete update is sent only to that remote identifier and success or failure remains visible without changing another placement

#### Scenario: Remote snapshot is no longer current
- **WHEN** accept-remote is requested for a snapshot marked missing
- **THEN** the request returns conflict without changing local desired state

### Requirement: Explicit missing-placement recovery
The system SHALL allow removal through the existing tombstone flow or explicit recreation of a confirmed missing placement, SHALL allocate a new remote identity through the normal create state machine, and SHALL not blindly apply the missing client's old advanced addresses.

#### Scenario: Missing placement is recreated
- **WHEN** the administrator confirms recreation
- **THEN** the stale remote identifier is cleared, a new remote client is created from managed common fields, and its newly assigned advanced state is hydrated

#### Scenario: Replacement creation is ambiguous
- **WHEN** recreation times out before its outcome is known
- **THEN** the placement becomes ambiguous and requires explicit candidate linking or cancellation with no blind retry

### Requirement: Scoped adoption and resolution API
The system SHALL require administrator or `clients:read` access for drift inspection, `clients:write` for adoption and every resolution, browser Origin validation for cookie-authenticated mutations, and `Cache-Control: private, no-store` on responses.

#### Scenario: Under-scoped adoption
- **WHEN** a PAT without `clients:write` submits adoption
- **THEN** the API returns `403` before local or upstream state changes

#### Scenario: Authorized drift read
- **WHEN** an administrator or `clients:read` PAT inspects a placement
- **THEN** the safe no-store drift representation is returned

### Requirement: Localized adoption and drift UI
The panel SHALL provide English and Russian controls to select at most one discovered client per node, confirm common fields, view field-level drift, accept remote, reapply desired, and remove or recreate missing placements.

#### Scenario: Adoption selection conflicts by node
- **WHEN** the administrator selects another discovered client from an already selected node
- **THEN** the prior selection is replaced or the new selection is blocked before submission

#### Scenario: Drift and missing states are displayed
- **WHEN** linked placements are classified as drift or missing
- **THEN** the UI shows node-scoped safe actions and requires explicit confirmation for resolution or recreation

#### Scenario: Browser state is inspected
- **WHEN** adoption and drift flows complete
- **THEN** credentials, keys, configuration, QR payloads, and raw upstream bodies are absent from routes and browser persistence
