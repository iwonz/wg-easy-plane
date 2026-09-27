## ADDED Requirements

### Requirement: Development resources support exact loopback hosts

The panel and subscription applications SHALL accept Next.js development resource requests originating from the exact local hosts `localhost` and `127.0.0.1`. This development-only allowlist SHALL NOT include non-loopback hosts and SHALL NOT change production origin enforcement.

#### Scenario: Developer opens an application through IPv4 loopback

- **WHEN** a developer opens either application through `127.0.0.1` and its browser requests development HMR resources
- **THEN** the application accepts those development resource requests without a cross-origin warning or blocked HMR connection

#### Scenario: Development resource request uses an unrelated host

- **WHEN** a development resource request originates from a host outside the exact `localhost` and `127.0.0.1` allowlist
- **THEN** the application does not opt that host into cross-origin development resource access

#### Scenario: Application runs in production

- **WHEN** either application runs as a production build
- **THEN** the development resource allowlist does not broaden its production origin or API trust boundaries
