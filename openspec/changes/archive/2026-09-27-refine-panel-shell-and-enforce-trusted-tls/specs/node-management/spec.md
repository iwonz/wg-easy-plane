## MODIFIED Requirements

### Requirement: Validated node endpoints
The system SHALL accept a name, `http` or `https` protocol, host without scheme or path, port from 1 through 65535, username, and password; it SHALL reject unknown request properties, duplicate names, and duplicate protocol-host-port endpoints with safe responses. Node request and response contracts SHALL NOT contain a setting that disables TLS certificate verification.

#### Scenario: Valid hostname or IP
- **WHEN** an administrator supplies a syntactically valid hostname, IPv4 address, or IPv6 address and valid port without unknown properties
- **THEN** the connection is eligible for testing and persistence

#### Scenario: URL or credential-bearing host
- **WHEN** the host contains a scheme, path, query, fragment, userinfo, whitespace, or control character
- **THEN** validation fails before any network request

#### Scenario: Legacy insecure TLS property
- **WHEN** a create, update, or unsaved test request contains `allowInsecureTls`
- **THEN** strict validation returns the standard `400` response and no node or network state changes

#### Scenario: Duplicate node identity
- **WHEN** a create or update would duplicate an existing node name or protocol-host-port tuple
- **THEN** the API returns `409` without exposing which credential values were supplied

### Requirement: Probe on create and update
The system SHALL perform the pinned adapter probe of `/api/information` followed by authenticated `GET /api/client` before completing every node creation or connection-setting update, SHALL persist the latest safe status even when the probe fails, SHALL trigger inventory synchronization after a healthy node is created, and SHALL never mutate wg-easy during those operations.

#### Scenario: Healthy node creation
- **WHEN** both probe calls conform to wg-easy 15.4.0 and authentication succeeds
- **THEN** the node is stored as `healthy` with version `15.4.0`, detected mode, and a UTC last-checked timestamp, then its safe discovered inventory is synchronized

#### Scenario: Failed node creation
- **WHEN** the probe times out, fails authentication or TLS, reports an unsupported version, or violates the API contract
- **THEN** the encrypted node is still stored with the corresponding safe status and can later be corrected or retested without starting inventory reconciliation

#### Scenario: Metadata-only edit
- **WHEN** only the node display name changes
- **THEN** the system retains encrypted credentials and connection settings and does not contact the upstream node

#### Scenario: Connection-setting edit omits credentials
- **WHEN** protocol, host, or port changes while username and password are omitted
- **THEN** the existing decrypted credentials are used for the probe and re-encrypted credentials remain protected at rest

## ADDED Requirements

### Requirement: Trusted TLS enforcement
The system SHALL verify TLS certificates for every HTTPS node connection and SHALL provide no API, UI, stored setting, or adapter option that disables certificate verification. Certificate verification failures SHALL remain visible through the safe `tls_error` status and `TLS_ERROR` code without exposing certificate or endpoint details.

#### Scenario: Trusted HTTPS node
- **WHEN** an HTTPS node presents a certificate trusted for its configured host
- **THEN** the connection remains eligible for the normal compatibility and authentication probes

#### Scenario: Untrusted HTTPS node
- **WHEN** an HTTPS node presents a certificate that cannot be verified
- **THEN** the probe fails as `tls_error` with `TLS_ERROR` and no bypass is offered

### Requirement: Fail-closed insecure TLS migration
The database migration SHALL remove the legacy `allow_insecure_tls` column while preserving node identities, encrypted credentials, detected mode and version, client snapshots, managed clients, placements, and their relationships. A node whose legacy value was true SHALL be marked `tls_error` with `TLS_ERROR` until a later trusted probe updates it; a node whose value was false SHALL retain its existing safe status.

#### Scenario: Database containing a formerly insecure node
- **WHEN** a version 1 database with a node whose `allow_insecure_tls` value is true is migrated
- **THEN** the column no longer exists, related data remains intact, and that node has safe TLS failure status while its last known mode, version, and snapshots remain available

#### Scenario: Database containing a trusted node
- **WHEN** a version 1 database with a node whose `allow_insecure_tls` value is false is migrated
- **THEN** the column no longer exists and the node, its safe status, and all related data remain intact

## REMOVED Requirements

### Requirement: Trusted TLS default and visible exception

**Reason**: The insecure TLS exception is removed so every HTTPS node connection enforces certificate verification.

**Migration**: Existing insecure nodes are marked `tls_error` / `TLS_ERROR`; install a trusted certificate and retest the node.
