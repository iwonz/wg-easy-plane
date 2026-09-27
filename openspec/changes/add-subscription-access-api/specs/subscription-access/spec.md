## ADDED Requirements

### Requirement: Administrators control one recoverable subscription link per managed client

The system SHALL allow an administrator or a PAT with the appropriate subscription scope to inspect, rotate, and revoke one subscription token for a managed client. The secret SHALL use the `wgep_sub_` format, be stored as a keyed hash plus AES-256-GCM ciphertext under separate HKDF-derived keys, and appear only after the fragment marker in the configured public subscription URL.

#### Scenario: Rotation replaces all previous access

- **WHEN** an authorized administrator rotates a managed client's subscription link
- **THEN** the system returns the new fragment URL over a private no-store response, increments the token version, and invalidates both the preceding raw token and every session issued for an older version

#### Scenario: Link creation requires a public subscription URL

- **WHEN** rotation is requested while `SUBSCRIPTION_PUBLIC_URL` is not configured
- **THEN** the system returns a safe conflict and does not create or change token material

### Requirement: Fragment tokens exchange for short read-only sessions

The system SHALL exchange a valid active subscription token for a 12-hour signed JWT delivered as a Secure, HttpOnly, SameSite cookie. The response body SHALL not contain the raw token or JWT, exchange attempts SHALL be rate limited through a keyed identity, and every protected request SHALL revalidate the token row, managed-client binding, version, and revocation state.

#### Scenario: BFF exchanges a fragment token

- **WHEN** the subscription BFF submits a valid `wgep_sub_` token obtained from the browser fragment
- **THEN** the panel returns only a safe expiry body, sets the subscription session cookie, and does not place either credential in the request URL or response body

#### Scenario: Revocation closes an existing session immediately

- **WHEN** an administrator revokes the token after a session was issued
- **THEN** the next protected request using that otherwise unexpired session returns unauthorized

### Requirement: Subscription reads expose only safe managed-client state

The system SHALL return only the session-bound managed client's shared status and per-node display name, mode, placement identity, and safe availability. It SHALL NOT expose node addresses, credentials, remote client IDs, desired payloads, upstream bodies, or management operations.

#### Scenario: Unavailable placements remain visible

- **WHEN** a placement is missing, deleting, ambiguous, attached to an unhealthy node, or belongs to a disabled, expired, or deleting client
- **THEN** the summary includes the placement with a safe unavailable status and no sensitive diagnostic value

### Requirement: Subscription artifacts are scoped and transient

The system SHALL proxy live configuration and validated QR bytes only for a deliverable placement belonging to the managed client in the current subscription session. Responses SHALL be private/no-store, configuration filenames SHALL be sanitized, and neither artifact SHALL be written to SQLite, logs, caches, or retained test output.

#### Scenario: A session cannot cross client boundaries

- **WHEN** a valid session requests a placement owned by another managed client
- **THEN** the system returns not found without revealing that the placement exists

#### Scenario: A deliverable placement is requested

- **WHEN** the session client is active and a current placement is available
- **THEN** configuration and QR endpoints proxy the exact validated bytes with strict media types and anti-cache headers

### Requirement: Subscription interfaces are typed and isolated from administrator authentication

The system SHALL document link lifecycle, exchange/logout, summary, configuration, and QR endpoints in OpenAPI 3.1. Administrator routes SHALL require the subscription PAT scopes or admin cookie, while read-only subscription routes SHALL accept only the dedicated subscription session cookie.

#### Scenario: Administrator access credentials are not accepted as subscription sessions

- **WHEN** a caller sends only an administrator cookie or PAT to a subscription read endpoint
- **THEN** the system returns unauthorized and does not fall back to administrator authorization
