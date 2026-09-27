## Purpose

Defines secure ownership bootstrap and browser authentication for the single-administrator control plane before privileged node or client operations are exposed.

## ADDED Requirements

### Requirement: Public setup state
The panel SHALL expose whether initial administrator setup is available without returning administrator identity, credential, session, or database details.

#### Scenario: Fresh installation
- **WHEN** no administrator exists and a caller reads setup status
- **THEN** the response reports that setup is required

#### Scenario: Configured installation
- **WHEN** an administrator exists and a caller reads setup status
- **THEN** the response reports that setup is complete without identifying the administrator

### Requirement: Atomic single-administrator setup
The panel SHALL atomically create exactly one administrator, SHALL validate a lowercase username of 3 to 64 allowed characters and a password of 12 to 128 characters, and SHALL hash the password with Argon2id before persistence.

#### Scenario: First valid registration
- **WHEN** a valid setup request reaches a fresh installation from the trusted panel origin
- **THEN** one administrator is created, no plaintext password is persisted, and an authenticated browser session is issued

#### Scenario: Concurrent first registration
- **WHEN** two valid setup requests race on a fresh installation
- **THEN** exactly one request succeeds and every other request receives `409 CONFLICT`

#### Scenario: Setup after configuration
- **WHEN** any setup request is made after an administrator exists
- **THEN** the request receives `409 CONFLICT` without revealing credential validity

#### Scenario: Invalid registration fields
- **WHEN** a setup request contains a username or password outside the documented policy
- **THEN** it receives the standard validation error and no administrator or session is created

### Requirement: Credential login
The panel SHALL authenticate the single administrator using the stored Argon2id password hash and SHALL return the same safe unauthorized response for an unknown username and an invalid password.

#### Scenario: Valid login
- **WHEN** the configured administrator submits valid credentials from the trusted panel origin
- **THEN** the panel returns the administrator's public identity and issues a new browser session

#### Scenario: Invalid login
- **WHEN** a caller submits an unknown username or invalid password
- **THEN** the panel returns `401 UNAUTHORIZED` without indicating which credential was wrong

### Requirement: Protected current-admin identity
The panel SHALL require a valid access session to return the current administrator's UUID and username and SHALL never return its password hash.

#### Scenario: Valid access cookie
- **WHEN** a caller with an unexpired valid access cookie reads the current administrator
- **THEN** the response contains only the administrator UUID and username

#### Scenario: Missing or invalid access cookie
- **WHEN** a caller without a valid access cookie reads the current administrator
- **THEN** the response receives `401 UNAUTHORIZED`

### Requirement: Secure browser session cookies
The panel SHALL issue a 15-minute access JWT and a 30-day refresh JWT in separate HttpOnly, Secure, SameSite=Lax cookies, scope both cookies to the panel, and sign JWTs with a key derived from `APP_ENCRYPTION_KEY` for authentication only.

#### Scenario: Session issuance
- **WHEN** setup or login succeeds
- **THEN** both cookies are set with the required flags and neither JWT appears in the response body

#### Scenario: Expired access token
- **WHEN** the access JWT has expired but the refresh JWT remains valid
- **THEN** protected endpoints reject the access request until refresh succeeds

### Requirement: Rotating refresh sessions
The panel SHALL rotate the refresh JWT on every successful refresh, SHALL persist only a keyed hash of each refresh identifier, and SHALL ensure one-time use atomically.

#### Scenario: Successful refresh
- **WHEN** a valid unrotated refresh cookie is presented from the trusted panel origin
- **THEN** the previous refresh record is marked rotated and new access and refresh cookies are issued in the same session family

#### Scenario: Concurrent refresh
- **WHEN** the same refresh JWT is presented concurrently
- **THEN** at most one rotation succeeds and reuse detection revokes the complete session family

#### Scenario: Rotated token replay
- **WHEN** an already rotated refresh JWT is presented again
- **THEN** all refresh sessions in its family are revoked, authentication cookies are cleared, and the response is `401 UNAUTHORIZED`

### Requirement: Logout and session invalidation
The panel SHALL provide idempotent logout that revokes the presented refresh family when identifiable and clears both authentication cookies.

#### Scenario: Authenticated logout
- **WHEN** a browser with a current refresh session logs out from the trusted panel origin
- **THEN** the refresh family is revoked and both cookies are expired

#### Scenario: Repeated logout
- **WHEN** logout is called with missing, expired, or previously revoked cookies
- **THEN** both cookies are still cleared and the operation succeeds without disclosing prior session state

### Requirement: Origin protection
The panel SHALL reject state-changing browser authentication requests whose `Origin` does not exactly match the configured panel public origin and SHALL fail closed when the trusted origin is not configured.

#### Scenario: Cross-site mutation
- **WHEN** a setup, login, refresh, or logout request carries an untrusted or missing Origin
- **THEN** it receives `403 FORBIDDEN` and does not mutate authentication state

### Requirement: Durable authentication rate limits
The panel SHALL apply persistent bounded-window rate limits to setup, login, and refresh attempts and SHALL return a safe `429 RATE_LIMITED` response with a retry hint when a limit is exceeded.

#### Scenario: Repeated failed login
- **WHEN** login attempts for one normalized username exceed the configured window limit
- **THEN** later attempts are rejected until the window resets, including an otherwise valid credential

#### Scenario: Process restart during a rate-limit window
- **WHEN** the panel restarts after attempts have been recorded
- **THEN** the remaining limit remains enforced from SQLite

### Requirement: Authentication-aware panel entry
The panel UI SHALL show setup on an unconfigured installation, login to an unauthenticated returning administrator, and the authenticated panel shell to a valid session without placing locale identifiers in the URL.

#### Scenario: First browser visit
- **WHEN** an unauthenticated browser opens a fresh panel installation
- **THEN** it sees the localized administrator setup form

#### Scenario: Returning browser without a session
- **WHEN** an unauthenticated browser opens an already configured panel
- **THEN** it sees the localized login form
