## MODIFIED Requirements

### Requirement: Read-only discovered-client API
The system SHALL expose cursor-paginated unlinked discovered-client snapshots to administrators and PATs with `clients:read`, with node identity, node display name and mode, remote client identifier, safe public fields, first-seen, last-seen, missing, and snapshot-version metadata; snapshots linked to any managed placement SHALL remain stored but SHALL be excluded from this list.

#### Scenario: Discovered list is requested
- **WHEN** an authorized caller requests a page of discovered clients
- **THEN** unlinked records have stable node-scoped identities and include freshness metadata without credentials or delivery payloads

#### Scenario: Remote client is linked to a placement
- **WHEN** a discovered snapshot's node and remote identifier are referenced by a managed placement
- **THEN** that snapshot no longer appears in the Discovered list while remaining available to managed lifecycle services

#### Scenario: Invalid or stale cursor
- **WHEN** a caller supplies a malformed cursor
- **THEN** the API returns the standard safe validation error and no upstream request occurs

#### Scenario: Under-scoped read
- **WHEN** a PAT without `clients:read` requests discovered clients
- **THEN** the API returns `403` without revealing whether any inventory exists
