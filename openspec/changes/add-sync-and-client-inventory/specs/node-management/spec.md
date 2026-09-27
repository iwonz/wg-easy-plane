## MODIFIED Requirements

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
- **WHEN** protocol, host, port, or TLS policy changes while username and password are omitted
- **THEN** the existing decrypted credentials are used for the probe and re-encrypted credentials remain protected at rest

### Requirement: Safe node status mapping
The system SHALL expose only `healthy`, `unreachable`, `auth_failed`, `tls_error`, `unsupported_version`, or `api_incompatible`, SHALL preserve the last known safe mode and version when a later transient probe fails, and SHALL expose the optional UTC timestamp of the last successful inventory synchronization without changing it on failed attempts.

#### Scenario: Authentication or 2FA rejection
- **WHEN** wg-easy rejects Basic Auth because credentials are invalid or 2FA is enabled
- **THEN** the node status is `auth_failed` without claiming which cause occurred

#### Scenario: Unsupported release
- **WHEN** a syntactically valid release other than 15.4.0 is detected
- **THEN** the status is `unsupported_version`, the safe detected version is retained, and no client mutation is attempted

#### Scenario: Contract or redirect failure
- **WHEN** information or client inventory is malformed, missing, oversized, or redirects
- **THEN** the status is `api_incompatible` and no upstream body or location is exposed

#### Scenario: Transient retest failure
- **WHEN** a previously healthy node later times out or is unreachable
- **THEN** its status changes to `unreachable` while its last known safe mode, supported version, and last-successful-sync timestamp remain available
