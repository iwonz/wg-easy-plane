## Purpose

Defines privacy-preserving administrator access to live WireGuard or AmneziaWG configuration files and QR images without retaining their sensitive payloads.

## ADDED Requirements

### Requirement: Resolved delivery targets
The system SHALL resolve managed delivery requests through an existing placement with a known remote identifier, SHALL resolve discovered delivery requests only through a current unlinked node-scoped snapshot, and SHALL reject ambiguous, deleting, missing, stale, or otherwise unresolved targets before requesting an artifact.

#### Scenario: Managed placement is current
- **WHEN** an authorized caller requests an artifact for a managed placement with a known current remote client
- **THEN** the system addresses exactly that placement's node and numeric remote identifier

#### Scenario: Discovered snapshot is already linked
- **WHEN** a caller uses a discovered-artifact route for a snapshot linked to a managed placement
- **THEN** the system returns a safe conflict or not-found response and does not request the artifact upstream

#### Scenario: Target is missing
- **WHEN** a placement or discovered snapshot is confirmed missing or has no remote identifier
- **THEN** the system returns a safe conflict response and no configuration or QR payload is returned

### Requirement: Authenticated scoped artifact API
The system SHALL expose separate live configuration and QR endpoints for managed placements and discovered clients beneath `/api/v1`, SHALL authorize administrator cookies and PATs with `clients:read`, and SHALL return the standard safe error envelope for validation, authorization, target, compatibility, and upstream failures.

#### Scenario: Authorized configuration request
- **WHEN** an administrator or PAT with `clients:read` requests a resolvable client's configuration
- **THEN** the system returns the live configuration as `application/octet-stream`

#### Scenario: Authorized QR request
- **WHEN** an administrator or PAT with `clients:read` requests a resolvable client's QR image
- **THEN** the system returns a validated live `image/svg+xml` response

#### Scenario: Under-scoped PAT
- **WHEN** a PAT without `clients:read` requests either artifact
- **THEN** the API returns `403` before node credentials are decrypted or an upstream request is made

### Requirement: Non-persistent private delivery
The system SHALL stream or return each artifact only for the current response, SHALL set `Cache-Control: private, no-store` and compatible anti-caching headers, and SHALL NOT persist or log configuration bytes, QR bytes, upstream Authorization values, node credentials, or raw artifact response bodies.

#### Scenario: Artifact request succeeds
- **WHEN** a live artifact is proxied successfully
- **THEN** its bytes are present only in the response path and no artifact payload is added to SQLite, application logs, browser persistence, or test recordings

#### Scenario: Upstream request fails
- **WHEN** wg-easy times out, rejects authentication, becomes incompatible, or returns an invalid artifact
- **THEN** the API returns only a stable safe error without the upstream body, credentials, node endpoint, or artifact content

### Requirement: Safe configuration download metadata
The system SHALL return configuration responses as attachments with a deterministic ASCII `.conf` filename derived from safe display metadata, bounded in length, free of path separators and control characters, and with a non-sensitive fallback.

#### Scenario: Display names contain unsafe characters
- **WHEN** client or node display names include Unicode, path separators, quotes, dots, or control characters
- **THEN** the `Content-Disposition` filename contains only the allowed bounded ASCII basename and one `.conf` suffix

### Requirement: Localized administrator delivery controls
The panel SHALL provide English and Russian configuration download and QR controls for eligible managed placements and current discovered clients, SHALL show QR in an ephemeral modal, and SHALL omit delivery controls for targets known to be missing or unresolved.

#### Scenario: Managed placement controls
- **WHEN** an eligible managed placement is displayed
- **THEN** the administrator can download its configuration or open its node-specific QR image

#### Scenario: Current discovered client controls
- **WHEN** an unlinked current discovered client is displayed
- **THEN** the administrator can download its configuration or open its node-specific QR image without adopting it

#### Scenario: QR modal closes
- **WHEN** the administrator closes the QR modal
- **THEN** the image element is removed and no QR payload is written to browser storage
