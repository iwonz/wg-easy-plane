## Purpose

Defines how administrators securely register, inspect, test, update, and remove wg-easy nodes without exposing credentials or bypassing the pinned compatibility boundary.

## ADDED Requirements

### Requirement: Encrypted node credentials
The system SHALL encrypt node usernames and passwords at rest with authenticated encryption under a node-specific HKDF-derived key, SHALL bind each ciphertext to its node and credential field, and SHALL never return credentials or ciphertext through node responses.

#### Scenario: Node is persisted
- **WHEN** an administrator creates a node with a username and password
- **THEN** neither plaintext value appears anywhere in the SQLite row or the returned node metadata

#### Scenario: Ciphertext is moved between fields or nodes
- **WHEN** encrypted credential material is replayed under a different node identifier or credential field
- **THEN** decryption fails closed without revealing the credential

#### Scenario: Node metadata is serialized
- **WHEN** a list, detail, mutation, or test response is serialized
- **THEN** it contains no username, password, Authorization header, ciphertext, or raw upstream body

### Requirement: Scoped node API
The system SHALL expose node list and detail reads to administrators and PATs with `nodes:read`, SHALL expose create, update, test, and delete mutations to administrators and PATs with `nodes:write`, and SHALL apply browser Origin checks to cookie-authenticated mutations.

#### Scenario: Read-scoped PAT
- **WHEN** a valid PAT with only `nodes:read` requests the node list or detail
- **THEN** safe node metadata is returned

#### Scenario: Under-scoped PAT mutation
- **WHEN** a PAT without `nodes:write` attempts to create, update, test, or delete a node
- **THEN** the API returns `403` and performs no node or upstream mutation

#### Scenario: Cookie mutation without trusted Origin
- **WHEN** an authenticated browser sends a node mutation without the configured trusted Origin
- **THEN** the API returns `403` and performs no node or upstream mutation

### Requirement: Validated node endpoints
The system SHALL accept a name, `http` or `https` protocol, host without scheme or path, port from 1 through 65535, username, password, and an explicit per-node insecure-TLS flag; it SHALL reject duplicate names and duplicate protocol-host-port endpoints with safe conflict responses.

#### Scenario: Valid hostname or IP
- **WHEN** an administrator supplies a syntactically valid hostname, IPv4 address, or IPv6 address and valid port
- **THEN** the connection is eligible for testing and persistence

#### Scenario: URL or credential-bearing host
- **WHEN** the host contains a scheme, path, query, fragment, userinfo, whitespace, or control character
- **THEN** validation fails before any network request

#### Scenario: Duplicate node identity
- **WHEN** a create or update would duplicate an existing node name or protocol-host-port tuple
- **THEN** the API returns `409` without exposing which credential values were supplied

### Requirement: Probe on create and update
The system SHALL perform the pinned adapter probe of `/api/information` followed by authenticated `GET /api/client` before completing every node creation or connection-setting update, SHALL persist the latest safe status even when the probe fails, and SHALL never mutate wg-easy during that probe.

#### Scenario: Healthy node creation
- **WHEN** both probe calls conform to wg-easy 15.4.0 and authentication succeeds
- **THEN** the node is stored as `healthy` with version `15.4.0`, detected mode, and a UTC last-checked timestamp

#### Scenario: Failed node creation
- **WHEN** the probe times out, fails authentication or TLS, reports an unsupported version, or violates the API contract
- **THEN** the encrypted node is still stored with the corresponding safe status and can later be corrected or retested

#### Scenario: Metadata-only edit
- **WHEN** only the node display name changes
- **THEN** the system retains encrypted credentials and connection settings and does not contact the upstream node

#### Scenario: Connection-setting edit omits credentials
- **WHEN** protocol, host, port, or TLS policy changes while username and password are omitted
- **THEN** the existing decrypted credentials are used for the probe and re-encrypted credentials remain protected at rest

### Requirement: Safe node status mapping
The system SHALL expose only `healthy`, `unreachable`, `auth_failed`, `tls_error`, `unsupported_version`, or `api_incompatible` and SHALL preserve the last known safe mode and version when a later transient probe fails.

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
- **THEN** its status changes to `unreachable` while its last known safe mode and supported version remain available

### Requirement: Explicit connection tests
The system SHALL support a non-persisting test for supplied connection settings and a stored-node retest that updates only safe status metadata.

#### Scenario: Unsaved connection test
- **WHEN** an administrator tests connection settings before saving
- **THEN** the API returns only status, safe version, mode, and last-checked time and creates no database row

#### Scenario: Stored node retest
- **WHEN** an administrator retests an existing node
- **THEN** encrypted credentials are decrypted only in memory, the adapter probe runs, and the node's safe status fields are updated

### Requirement: Trusted TLS default and visible exception
The system SHALL verify TLS certificates by default, SHALL disable verification only for a node whose `allowInsecureTls` flag is explicitly true, and SHALL show a persistent warning for every such node in the administrative UI.

#### Scenario: HTTPS node defaults to trusted TLS
- **WHEN** a new HTTPS node is created without explicitly enabling insecure TLS
- **THEN** certificate verification remains enabled

#### Scenario: Insecure TLS node is displayed
- **WHEN** a stored node has insecure TLS enabled
- **THEN** its list/detail UI visibly warns that certificate verification is disabled

### Requirement: Safe node deletion
The system SHALL delete a node only when it has no managed placements and SHALL NOT delete any remote wg-easy client as a side effect.

#### Scenario: Node without placements
- **WHEN** an authorized administrator deletes a node with no managed placements
- **THEN** the local node and its encrypted credentials are removed without an upstream request

#### Scenario: Node with a managed placement
- **WHEN** deletion is requested for a node referenced by any managed placement
- **THEN** the API returns `409` and leaves both node and remote state unchanged

### Requirement: Localized node administration UI
The panel SHALL provide localized English and Russian node listing, creation, editing, testing, status, and deletion flows through MobX state without placing credentials in URLs or browser persistence.

#### Scenario: Administrator adds a node
- **WHEN** the administrator submits the node modal
- **THEN** the UI displays the persisted safe status and clears password state after the request completes

#### Scenario: Administrator edits a node
- **WHEN** the edit modal opens for an existing node
- **THEN** no credential is prefilled and the administrator can leave credential fields blank to retain stored values

#### Scenario: Browser storage is inspected
- **WHEN** node UI operations complete
- **THEN** username, password, Authorization values, and upstream bodies are absent from the route, local storage, and session storage
