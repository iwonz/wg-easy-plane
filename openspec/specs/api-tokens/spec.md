# api-tokens Specification

## Purpose
Defines revocable, least-privilege personal access tokens for typed API automation without exposing browser sessions or retaining recoverable token secrets.

## Requirements

### Requirement: Fixed scope vocabulary
The system SHALL accept only `system:read`, `nodes:read`, `nodes:write`, `clients:read`, `clients:write`, `subscriptions:read`, `subscriptions:write`, and `tokens:manage` as API token scopes, SHALL require at least one unique scope, and SHALL NOT implicitly expand write scopes into read scopes.

#### Scenario: Unknown or repeated scope
- **WHEN** a token creation request contains an unknown scope or repeats a scope
- **THEN** the request receives the standard validation error and no token is created

#### Scenario: Exact scope assignment
- **WHEN** a token is created with a valid subset of scopes
- **THEN** only that exact subset is assigned to the token

### Requirement: One-time PAT creation
An authorized administrator or PAT with `tokens:manage` SHALL be able to create a named `wgep_pat_*` token with an optional future expiration, and the system SHALL return the complete secret exactly once in the successful creation response.

#### Scenario: Valid token creation
- **WHEN** an authorized caller submits a non-empty name, at least one valid scope, and no expiration or a future ISO-8601 UTC expiration
- **THEN** the system creates the token, returns its metadata and complete secret once, and does not make that secret recoverable through later API calls

#### Scenario: Invalid expiration
- **WHEN** token creation specifies an expiration that is not in the future
- **THEN** the request receives the standard validation error and no token is created

### Requirement: Hash-only token persistence
The system SHALL generate API tokens with at least 256 bits of cryptographic randomness, SHALL persist only a key-separated hash and a non-secret identifying prefix, and SHALL NOT persist or log the complete token.

#### Scenario: Token stored after creation
- **WHEN** a newly issued token is inspected through the database and ordinary application output
- **THEN** neither the complete secret nor a reversible representation of it is present

### Requirement: Paginated token metadata
An authorized administrator or PAT with `tokens:manage` SHALL be able to list token metadata with bounded cursor pagination, including UUID, name, identifying prefix, exact scopes, creation time, optional expiration, optional last-used time, and optional revocation time, but never the token hash or complete secret.

#### Scenario: List token metadata
- **WHEN** an authorized caller lists tokens with a valid limit and cursor
- **THEN** the response contains a stable page ordered from newest to oldest and an opaque next cursor when more records exist

#### Scenario: Secret cannot be retrieved
- **WHEN** a caller lists a token after its creation response has completed
- **THEN** the response exposes only safe metadata and cannot recover the complete secret

### Requirement: Bearer authentication
Protected API routes SHALL authenticate `Authorization: Bearer wgep_pat_*` credentials using the stored hash, SHALL reject malformed, unknown, expired, or revoked tokens with the same safe `401 UNAUTHORIZED` response, and SHALL treat a presented Authorization header as authoritative instead of falling back to a browser cookie.

#### Scenario: Active token
- **WHEN** a request presents an active well-formed PAT
- **THEN** the request is associated with that token's UUID and exact scopes without exposing its secret

#### Scenario: Invalid token states
- **WHEN** a request presents a malformed, unknown, expired, or revoked PAT
- **THEN** it receives the same standard `401 UNAUTHORIZED` response without revealing which condition failed

#### Scenario: Invalid Bearer with valid cookie
- **WHEN** a request presents an invalid Authorization header together with a valid administrator cookie
- **THEN** Bearer authentication fails and the request does not fall back to the cookie

### Requirement: Exact scope authorization
Each PAT-protected operation SHALL declare its required scope and SHALL return the standard `403 FORBIDDEN` response when an authenticated PAT lacks that exact scope; browser administrator sessions SHALL retain full panel authority.

#### Scenario: Required scope present
- **WHEN** an active PAT carries the exact scope required by an operation
- **THEN** the operation is authorized

#### Scenario: Required scope absent
- **WHEN** an active PAT lacks the exact required scope, including when it has the corresponding read or write counterpart
- **THEN** the operation receives `403 FORBIDDEN` without disclosing token metadata

### Requirement: Immediate revocation and expiration
An authorized administrator or PAT with `tokens:manage` SHALL be able to revoke a token by UUID, revocation SHALL be idempotent for an existing token, and revoked or expired tokens SHALL fail authentication immediately according to the panel clock.

#### Scenario: Revoke active token
- **WHEN** an authorized caller revokes an existing active token
- **THEN** its revocation time is stored and all subsequent Bearer requests using it receive `401 UNAUTHORIZED`

#### Scenario: Revoke token again
- **WHEN** an authorized caller revokes an existing already-revoked token
- **THEN** the operation succeeds without changing its original revocation time

#### Scenario: Token reaches expiration
- **WHEN** the current time reaches or passes a token's expiration
- **THEN** subsequent Bearer requests using it receive `401 UNAUTHORIZED`

### Requirement: Last-used tracking
The system SHALL record the current time as `lastUsedAt` when a PAT is successfully authenticated, including an authenticated request that is later denied for insufficient scope, and SHALL NOT update it for invalid credentials.

#### Scenario: Successful authentication
- **WHEN** an active PAT is successfully resolved from a Bearer credential
- **THEN** its last-used timestamp advances before authorization is evaluated

#### Scenario: Invalid credential
- **WHEN** a malformed, unknown, expired, or revoked PAT is presented
- **THEN** no token's last-used timestamp changes

### Requirement: Credential-specific mutation protection
State-changing token-management requests authenticated by a browser cookie SHALL require the exact trusted panel Origin, while requests authenticated by a valid PAT SHALL not depend on browser Origin headers.

#### Scenario: Cookie mutation from untrusted origin
- **WHEN** a valid administrator cookie submits token creation or revocation without the trusted Origin
- **THEN** the request receives `403 FORBIDDEN` and no token state changes

#### Scenario: PAT mutation without browser origin
- **WHEN** a PAT with `tokens:manage` submits token creation or revocation without an Origin header
- **THEN** authorization proceeds using the PAT scope

### Requirement: Panel token management
The authenticated panel SHALL provide localized controls to list token metadata, create tokens from the fixed scope vocabulary, copy a newly issued secret, dismiss it permanently from UI state, and revoke existing tokens without locale-prefixed routes.

#### Scenario: Create token in the panel
- **WHEN** the administrator creates a token from the panel
- **THEN** the complete secret is shown in a one-time warning view and is not shown again after dismissal or reload

#### Scenario: Revoke token in the panel
- **WHEN** the administrator confirms revocation
- **THEN** the token is marked revoked in the localized list and can no longer authenticate
