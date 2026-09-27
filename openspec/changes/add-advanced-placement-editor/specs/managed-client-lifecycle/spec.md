## MODIFIED Requirements

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
