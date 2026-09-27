## ADDED Requirements

### Requirement: Verified constrained transport
The adapter SHALL use a 10-second default request timeout, SHALL never follow HTTP redirects, SHALL validate response size before buffering beyond its configured limit, and SHALL verify TLS certificates for every HTTPS request with no per-instance or per-node bypass.

#### Scenario: Request times out
- **WHEN** the upstream does not complete within the configured timeout
- **THEN** the request is aborted and returns `TIMEOUT` without including the node URL or credential

#### Scenario: Upstream redirect
- **WHEN** an endpoint returns a redirect response
- **THEN** the adapter does not contact the redirect target and returns `REDIRECT_BLOCKED`

#### Scenario: Untrusted TLS certificate
- **WHEN** a TLS certificate cannot be verified
- **THEN** the adapter returns `TLS_ERROR` without exposing certificate, node URL, or credential details and offers no verification bypass

#### Scenario: Adapter connection metadata
- **WHEN** an adapter instance is created or inspected
- **THEN** its accepted connection options and safe metadata contain no insecure TLS setting

## REMOVED Requirements

### Requirement: Constrained transport

**Reason**: Its explicit insecure TLS instance mode is incompatible with the trusted-only transport boundary.

**Migration**: Construct adapters without an insecure TLS option; certificate verification failures continue to map to `TLS_ERROR`.
