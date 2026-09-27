# managed-client-lifecycle Specification

## Purpose
Defines safe, observable lifecycle management for one logical client placed across one or more compatible wg-easy nodes.

## Requirements

### Requirement: Managed client and placement identity
The system SHALL represent a managed client with a local UUID, shared name, optional UTC expiration, enabled state, lifecycle state, and one placement per selected node; each placement SHALL have its own UUID, optional numeric remote client identifier, desired state, safe status, and optional stable error code.

#### Scenario: Multi-node client is created
- **WHEN** an administrator creates a managed client for two distinct nodes
- **THEN** one local managed client and two independently tracked placements are created

#### Scenario: Duplicate node selection
- **WHEN** a create or add-placement request contains the same node more than once or targets an existing placement node
- **THEN** validation fails before any upstream mutation

### Requirement: Best-effort multi-node creation
The system SHALL create each placement independently through the pinned adapter, SHALL retain successful remote clients when another placement fails, and SHALL return all placement outcomes without compensating deletion.

#### Scenario: Every node succeeds
- **WHEN** every selected healthy compatible node creates the client
- **THEN** every placement stores its remote identifier and becomes active

#### Scenario: One node fails definitively
- **WHEN** one selected node succeeds and another returns a definite safe error
- **THEN** the successful placement remains active, the failed placement becomes error with a retry action, and the successful remote client is not deleted

#### Scenario: Node is incompatible or unhealthy
- **WHEN** a placement targets a node that is not healthy and supported
- **THEN** no mutation is sent to that node and the placement records a safe retryable failure

### Requirement: Ambiguous create safety
The system SHALL classify a create timeout as ambiguous, SHALL prohibit blind retry, SHALL synchronize the node, and SHALL require an explicit operator decision to link one unlinked node-scoped candidate or cancel the ambiguous placement.

#### Scenario: Create times out
- **WHEN** the upstream create request times out before its outcome is known
- **THEN** the placement and operation attempt become ambiguous and no automatic create retry occurs

#### Scenario: Candidate is explicitly linked
- **WHEN** the administrator selects a matching unlinked discovered client on that placement's node
- **THEN** its remote identifier and hydrated desired state are linked and the placement becomes active

#### Scenario: Ambiguous retry is requested
- **WHEN** retry is requested before the placement is linked or cancelled
- **THEN** the API returns `409` and performs no upstream create

#### Scenario: Ambiguous placement is cancelled
- **WHEN** the administrator confirms cancellation
- **THEN** the local placement is removed without an upstream delete or create

### Requirement: Shared field propagation
The system SHALL propagate managed name and expiration updates to all known active placements with complete update payloads that preserve every advanced mutable remote field, including null, empty, ordered, and mode-specific values, and SHALL propagate enabled state through explicit enable or disable operations.

#### Scenario: Common update partially fails
- **WHEN** one placement accepts the common update and another fails
- **THEN** the shared local fields remain updated, the success becomes active, and the failure becomes error with its complete desired state retained for retry

#### Scenario: Remote mutable fields are preserved
- **WHEN** a common name or expiration update is built after an advanced edit
- **THEN** every non-common WireGuard or AmneziaWG field in the complete desired payload is sent unchanged

#### Scenario: Enable or disable is requested
- **WHEN** the managed client's enabled state changes
- **THEN** each known remote placement is toggled best-effort and partial failures remain retryable without discarding its advanced desired payload

### Requirement: Placement add, remove, and retry
The system SHALL allow adding a new node placement, removing one placement through remote deletion, and retrying durable failed or deleting placement work without repeating already successful placements; a retry of a known remote placement SHALL use the full durable desired payload.

#### Scenario: Placement is added
- **WHEN** an administrator selects a node not already used by the managed client
- **THEN** one pending placement is created and follows the normal create state machine

#### Scenario: Placement removal returns remote 404
- **WHEN** wg-easy reports that the known remote client is already absent
- **THEN** removal is treated as successful and the local placement is deleted

#### Scenario: Failed placement is retried
- **WHEN** an error placement with a known remote identifier and complete advanced desired state is retried
- **THEN** only that placement receives the same complete update payload with current shared fields

### Requirement: Tombstone managed deletion
The system SHALL persist a deleting tombstone before remote deletion, SHALL delete placements best-effort, and SHALL remove the managed-client row only after every placement has been removed successfully.

#### Scenario: Full deletion succeeds
- **WHEN** every placement delete succeeds or returns remote `404`
- **THEN** all placements and the managed client are removed locally

#### Scenario: Deletion partially fails
- **WHEN** at least one placement cannot be deleted
- **THEN** successful placements are removed, the managed client remains deleting, and failed deleting placements remain visible and retryable

### Requirement: Scoped managed-client API
The system SHALL expose paginated managed-client and placement reads to administrators and PATs with `clients:read`, SHALL require `clients:write` for every lifecycle mutation, SHALL apply browser Origin checks to cookie-authenticated mutations, and SHALL return only safe local, node, snapshot, and operation metadata.

#### Scenario: Under-scoped mutation
- **WHEN** a PAT without `clients:write` requests a lifecycle mutation
- **THEN** the API returns `403` before local or upstream state changes

#### Scenario: Authorized list
- **WHEN** an administrator or `clients:read` PAT lists managed clients
- **THEN** cursor-paginated clients and placement outcomes are returned without credentials, raw upstream content, configuration, or QR data

### Requirement: Localized managed-client UI

The panel SHALL provide localized English and Russian managed-client listing, creation with node selection and optional expiration, common update, enable/disable, retry, ambiguous recovery, placement removal, and tombstone deletion controls. Managed-client row actions SHALL use accessible icon controls with localized labels or tooltips, and the view SHALL not repeat a Clients heading beneath the primary Clients tab.

#### Scenario: Partial outcome is displayed

- **WHEN** a multi-node operation succeeds on one node and fails on another
- **THEN** the UI displays both node-specific states and offers retry only where safe

#### Scenario: Managed-client actions are displayed

- **WHEN** a managed-client row is rendered
- **THEN** its available actions use recognizable icons with accessible localized names and no redundant Clients content heading

#### Scenario: Managed state is inspected in the browser

- **WHEN** lifecycle operations complete
- **THEN** credentials, Authorization values, configurations, QR payloads, and raw upstream bodies are absent from routes and browser persistence
