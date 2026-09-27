# subscription-application Specification

## Purpose
Define the isolated read-only web experience through which a managed client securely receives live per-node VPN configurations without exposing subscription credentials to request URLs, browser persistence, or the control-plane origin.

## Requirements

### Requirement: The subscription application consumes fragment credentials without URL leakage

The subscription browser application SHALL accept only exact `wgep_sub_` tokens from the URL fragment, remove the fragment from visible history before exchange, send it only in a same-origin BFF JSON body, and never persist the token or session JWT in JavaScript state or browser storage.

#### Scenario: A user opens a valid subscription link

- **WHEN** the page loads with a valid token after `#`
- **THEN** no HTTP request contains the fragment, the browser immediately replaces the URL without it, the BFF exchanges it, and subsequent client code holds only safe subscription state

#### Scenario: The fragment is malformed

- **WHEN** the fragment does not match the exact subscription token format
- **THEN** the application removes it, does not contact the exchange endpoint, and shows a localized invalid-link state

### Requirement: The BFF isolates browsers from the control plane

The subscription application SHALL contact only a configured fixed control-plane HTTP(S) origin server-side, forward only the named subscription cookie, reject redirects, enforce a bounded timeout, validate JSON/media contracts, and convert network or malformed upstream failures into safe private no-store responses.

#### Scenario: The control plane is unavailable or malformed

- **WHEN** a BFF request times out, redirects, returns an unexpected schema, or returns an unexpected artifact media type
- **THEN** the BFF returns a generic unavailable response without exposing the internal URL, headers, cookies, token, response body, or diagnostic detail

### Requirement: The application presents safe per-node subscription access

The application SHALL show the client status and each placement separately with node name, protocol mode, safe availability, live configuration download, live QR display, and the appropriate official application link. Artifact controls SHALL be enabled only for available placements.

#### Scenario: A WireGuard or AmneziaWG placement is available

- **WHEN** the summary marks a placement available
- **THEN** the user can download its configuration, open an ephemeral QR modal, and follow the official installation page matching the node mode

#### Scenario: A placement or client is unavailable

- **WHEN** the panel reports a disabled, expired, deleting, node-unavailable, or placement-unavailable state
- **THEN** the application keeps the item visible with a localized explanation and disables configuration and QR actions

### Requirement: The subscription UI supports locale and theme without route prefixes

The application SHALL support Russian and English message files, select Russian for a Russian browser or saved locale, fall back to English, omit locale segments from routes, and support light, dark, and system color schemes.

#### Scenario: A Russian browser opens a clean session

- **WHEN** no locale cookie exists and the browser prefers Russian
- **THEN** the subscription page renders Russian messages at the same unprefixed URL

### Requirement: Administrators manage subscription links from managed clients

The panel SHALL provide transient controls to inspect, create, copy, rotate, and revoke a managed client's subscription link using the existing scoped subscription API. Full fragment URLs SHALL not be written to browser persistence or logs.

#### Scenario: An administrator rotates an active link

- **WHEN** the administrator confirms rotation in the managed-client dialog
- **THEN** the panel replaces the displayed URL with the newly returned fragment link and the previous link/session becomes invalid through the API lifecycle
