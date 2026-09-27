## Purpose

Defines the only supported, version-gated, schema-validated, and privacy-safe boundary between the control plane and wg-easy nodes.

## ADDED Requirements

### Requirement: Exact upstream compatibility gate
The adapter SHALL support exactly wg-easy `15.4.0`, SHALL normalize the source's `v15.4.0` release value for comparison, and SHALL reject every other version before sending a client mutation.

#### Scenario: Supported release
- **WHEN** `/api/information` returns a response matching the 15.4.0 schema with `currentRelease` equal to `v15.4.0`
- **THEN** the adapter reports compatibility with normalized version `15.4.0`

#### Scenario: Unsupported release
- **WHEN** `/api/information` returns any other syntactically valid release
- **THEN** the adapter returns `UNSUPPORTED_VERSION` with only the safe detected version and sends no subsequent mutation

#### Scenario: Malformed information response
- **WHEN** `/api/information` contains missing, mistyped, or unexpected fields
- **THEN** the adapter returns `API_INCOMPATIBLE` and does not expose the response body

### Requirement: WireGuard mode detection
The adapter SHALL derive node mode only from the strict 15.4.0 `isAwg` information field, mapping `false` to `wireguard` and `true` to `amnezia`.

#### Scenario: AmneziaWG node
- **WHEN** compatible information contains `isAwg: true`
- **THEN** the adapter reports mode `amnezia`

#### Scenario: WireGuard node
- **WHEN** compatible information contains `isAwg: false`
- **THEN** the adapter reports mode `wireguard`

### Requirement: Constrained transport
The adapter SHALL use a 10-second default request timeout, SHALL never follow HTTP redirects, SHALL validate response size before buffering beyond its configured limit, and SHALL use certificate verification unless insecure TLS is explicitly enabled for that adapter instance.

#### Scenario: Request times out
- **WHEN** the upstream does not complete within the configured timeout
- **THEN** the request is aborted and returns `TIMEOUT` without including the node URL or credential

#### Scenario: Upstream redirect
- **WHEN** an endpoint returns a redirect response
- **THEN** the adapter does not contact the redirect target and returns `REDIRECT_BLOCKED`

#### Scenario: Untrusted TLS by default
- **WHEN** a TLS certificate cannot be verified and insecure TLS is not enabled
- **THEN** the adapter returns `TLS_ERROR`

#### Scenario: Explicit insecure TLS
- **WHEN** insecure TLS is explicitly enabled for one adapter instance
- **THEN** only that instance disables certificate verification and its connection metadata reports the insecure setting

### Requirement: Basic Authentication boundary
Every protected wg-easy request SHALL carry a Basic Authorization value derived in memory from that node's username and password, and the adapter SHALL never expose or log the header or credentials.

#### Scenario: Valid Basic credentials
- **WHEN** the compatible node accepts the configured username and password
- **THEN** protected client operations may proceed

#### Scenario: Invalid password or enabled 2FA
- **WHEN** wg-easy returns its Basic Auth rejection for either an invalid credential or a user with 2FA enabled
- **THEN** the adapter returns the same safe `AUTH_FAILED` result because wg-easy 15.4.0 does not distinguish those causes

### Requirement: Strict client contracts
The adapter SHALL strictly validate all request and response bodies used for client listing, creation, full update, enable, disable, and deletion against the verified wg-easy 15.4.0 source contract and SHALL reject unknown response fields as incompatible.

#### Scenario: Valid client inventory
- **WHEN** authenticated `GET /api/client` returns a conforming array
- **THEN** the adapter returns typed remote clients with numeric IDs and the mutable 15.4.0 fields

#### Scenario: Malformed client inventory
- **WHEN** any client entry is missing a required field, contains a mistyped field, or contains an unexpected field
- **THEN** the complete response is rejected with `API_INCOMPATIBLE` and no partial inventory is returned

#### Scenario: Full client update
- **WHEN** a caller supplies every mutable field in the 15.4.0 update contract
- **THEN** the adapter validates the complete body and sends it to `POST /api/client/{clientId}`

#### Scenario: Invalid mutation body
- **WHEN** a create or update body violates the pinned schema
- **THEN** the adapter rejects it locally without contacting the node

### Requirement: Safe client projection
The adapter SHALL remove upstream one-time links and runtime peer endpoints from returned inventory, SHALL never return private or preshared keys, and SHALL expose only fields required by later inventory and lifecycle services.

#### Scenario: Upstream list contains sensitive nested data
- **WHEN** a conforming list entry includes a one-time link or runtime endpoint
- **THEN** strict validation succeeds but the adapter's returned client contains neither value

#### Scenario: Safe value inspection
- **WHEN** a returned client or adapter error is serialized for diagnostics
- **THEN** it contains no Authorization value, username, password, node URL, response body, one-time link, configuration, or QR payload

### Requirement: Live configuration and QR responses
The adapter SHALL support authenticated live configuration and QR SVG retrieval as bounded byte responses, SHALL validate their expected media types and safe SVG structure, and SHALL not cache or persist either payload.

#### Scenario: Configuration download
- **WHEN** the configuration endpoint returns a successful bounded `application/octet-stream` response
- **THEN** the adapter returns the bytes only to the immediate caller

#### Scenario: Safe QR SVG
- **WHEN** the QR endpoint returns bounded `image/svg+xml` content with an SVG root and no script, foreign object, doctype, or external reference
- **THEN** the adapter returns the SVG bytes only to the immediate caller

#### Scenario: Unsafe artifact response
- **WHEN** a live artifact has the wrong media type, exceeds the byte limit, or contains unsafe SVG structure
- **THEN** the adapter returns `API_INCOMPATIBLE` without exposing the payload

### Requirement: Sanitized stable failures
The adapter SHALL map transport, TLS, timeout, authentication, not-found, unsupported-version, incompatible-contract, redirect, oversized-response, and other upstream failures to stable error codes containing only operation name and explicitly safe scalar metadata.

#### Scenario: Upstream error body contains secrets
- **WHEN** wg-easy returns an error response whose body contains arbitrary sensitive text
- **THEN** the adapter error includes only its stable code, operation, and safe HTTP status and discards the body

#### Scenario: Delete missing client
- **WHEN** deletion receives upstream `404`
- **THEN** the adapter returns a typed `not_found` deletion result so the lifecycle layer can treat it as idempotent success

### Requirement: Synthetic contract evidence
The repository SHALL test the adapter only with synthetic fixtures and local mock transports and SHALL NOT record responses, credentials, addresses, configurations, or QR data from live nodes.

#### Scenario: Contract fixture review
- **WHEN** adapter fixtures and tests are inspected
- **THEN** they contain only documentation-range addresses, synthetic identities, and generated non-operational payloads
