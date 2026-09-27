# client-inventory-sync Specification

## Purpose
Defines how the control plane obtains, retains, exposes, and refreshes a privacy-safe read-only inventory of clients discovered on registered wg-easy nodes.

## Requirements

### Requirement: Atomic safe inventory reconciliation
The system SHALL reconcile a node's discovered clients only from a complete response that passes the pinned wg-easy 15.4.0 information and client schemas, SHALL identify each client by node and numeric remote identifier, and SHALL update the node's last-successful-sync timestamp in the same transaction.

#### Scenario: Successful complete synchronization
- **WHEN** a node returns a valid supported information response and complete client list
- **THEN** every returned client is upserted as a safe public snapshot, previously known absent clients are marked missing, and the node receives the successful UTC sync timestamp atomically

#### Scenario: Same client name on two nodes
- **WHEN** two nodes return clients with the same display name
- **THEN** the inventory retains two independent records keyed by their respective node and remote identifier

#### Scenario: Client returns after being missing
- **WHEN** a later successful inventory includes a previously missing node-and-remote-identifier pair
- **THEN** the existing record is refreshed and its missing marker is cleared without changing its first-seen timestamp

### Requirement: Last safe snapshot preservation
The system SHALL leave all discovered-client rows and the node's last-successful-sync timestamp unchanged when a synchronization cannot produce a complete compatible inventory, while updating only safe node status and sanitized run metadata.

#### Scenario: Transport or authentication failure
- **WHEN** synchronization fails because of timeout, connectivity, authentication, or TLS
- **THEN** the last safe inventory remains readable and no client is marked missing

#### Scenario: Unsupported or malformed upstream response
- **WHEN** the node reports a version other than 15.4.0 or a response fails the strict contract
- **THEN** the last safe inventory remains unchanged and the node is marked `unsupported_version` or `api_incompatible`

#### Scenario: Empty valid inventory
- **WHEN** a complete supported response contains zero clients
- **THEN** all previously observed clients for that node are marked missing because absence was established safely

### Requirement: Sanitized synchronization records
The system SHALL record each synchronization attempt as running and then succeeded or failed with timestamps and an optional stable safe error code, and SHALL NOT persist or log node credentials, endpoints, Authorization values, raw upstream bodies, configuration payloads, QR payloads, or unknown upstream fields.

#### Scenario: Failed synchronization record
- **WHEN** a synchronization attempt fails at the upstream trust boundary
- **THEN** its run ends as failed with only a safe error code and timestamps

#### Scenario: Stored client projection is inspected
- **WHEN** discovered-client database rows are inspected after synchronization
- **THEN** they contain only schema-approved public client fields plus snapshot metadata and no configuration, QR, endpoint, one-time link, or unknown upstream value

### Requirement: Coordinated scheduled synchronization
The panel SHALL schedule synchronization at the configured interval, defaulting to 300 seconds, SHALL disable the scheduler when `SYNC_INTERVAL_SECONDS=0`, SHALL use an expiring database lease so only one holder starts a scheduled cycle, and SHALL prevent overlapping synchronization of the same node.

#### Scenario: Scheduler is enabled
- **WHEN** the panel runtime starts with a positive synchronization interval and owns the lease
- **THEN** it periodically attempts each registered node without overlapping a prior attempt for that node

#### Scenario: Scheduler is disabled
- **WHEN** the panel runtime starts with `SYNC_INTERVAL_SECONDS=0`
- **THEN** no background timer or scheduled upstream request is started while manual synchronization remains available

#### Scenario: Lease is held elsewhere
- **WHEN** another unexpired holder owns the scheduler lease
- **THEN** the current process skips that scheduled cycle without contacting nodes

#### Scenario: Expired lease
- **WHEN** the prior holder's lease has expired
- **THEN** a new process can atomically acquire it and run the scheduled cycle

### Requirement: Scoped manual synchronization
The system SHALL expose manual node synchronization to administrators and PATs with `nodes:write`, SHALL apply the browser Origin check to cookie-authenticated requests, and SHALL return a safe run summary without upstream content.

#### Scenario: Authorized manual synchronization
- **WHEN** an administrator or `nodes:write` PAT requests synchronization for an existing node
- **THEN** one synchronization attempt runs and returns its safe status, counts, timestamps, and optional stable error code

#### Scenario: Under-scoped PAT
- **WHEN** a PAT without `nodes:write` requests manual synchronization
- **THEN** the API returns `403` and performs no upstream request

#### Scenario: Synchronization already active
- **WHEN** manual synchronization is requested while the same node is already synchronizing
- **THEN** the API returns a safe conflict response and does not start a second upstream request

### Requirement: Read-only discovered-client API
The system SHALL expose cursor-paginated discovered-client snapshots to administrators and PATs with `clients:read`, with node identity, node display name and mode, remote client identifier, safe public fields, first-seen, last-seen, missing, and snapshot-version metadata.

#### Scenario: Discovered list is requested
- **WHEN** an authorized caller requests a page of discovered clients
- **THEN** records have stable node-scoped identities and include freshness metadata without credentials or delivery payloads

#### Scenario: Invalid or stale cursor
- **WHEN** a caller supplies a malformed cursor
- **THEN** the API returns the standard safe validation error and no upstream request occurs

#### Scenario: Under-scoped read
- **WHEN** a PAT without `clients:read` requests discovered clients
- **THEN** the API returns `403` without revealing whether any inventory exists

### Requirement: Localized inventory and compatibility visibility
The panel SHALL display localized English and Russian discovered-client inventory with node, mode, freshness, and missing state, and SHALL show a global non-sensitive warning while any node is unsupported or API-incompatible.

#### Scenario: Compatible discovered inventory
- **WHEN** synchronized clients are available
- **THEN** the administrator can view each node-client record separately with its last-seen and current or missing state

#### Scenario: Global compatibility warning
- **WHEN** at least one node has `unsupported_version` or `api_incompatible` status
- **THEN** the authenticated panel shows a global warning that mutations are blocked without displaying node host, IP, credentials, or upstream response content

#### Scenario: Browser locale and fallback
- **WHEN** the inventory UI is opened with Russian browser locale or an unsupported locale
- **THEN** it uses Russian for the former and English for the latter without adding a locale segment to the route
