# runtime-storage Specification

## Purpose
Defines secure runtime configuration and durable SQLite storage for the single-replica control plane.

## Requirements

### Requirement: External database location
The panel SHALL store SQLite data outside the source tree by default and SHALL accept an absolute database path through `DATABASE_PATH`.

#### Scenario: Bare runtime without a path override
- **WHEN** the panel starts without `DATABASE_PATH`
- **THEN** it resolves the database beneath the operating system user-data directory, not the working directory

#### Scenario: Explicit path override
- **WHEN** `DATABASE_PATH` contains an absolute file path
- **THEN** the panel uses that exact path

### Requirement: Fail-fast configuration
The runtime SHALL reject missing or malformed security and numeric configuration before serving application traffic and SHALL NOT include secret values in validation errors.

#### Scenario: Missing encryption key
- **WHEN** runtime configuration is loaded without a valid base64-encoded 32-byte `APP_ENCRYPTION_KEY`
- **THEN** startup fails with the variable name and no secret content

### Requirement: Secure SQLite initialization
The database SHALL enable WAL, foreign keys, and a busy timeout and SHALL create its parent directory and database file with owner-only permissions where supported.

#### Scenario: Opening a new database
- **WHEN** the configured database file does not exist
- **THEN** its directory is created, SQLite safety pragmas are enabled, and the resulting file is owner-readable and owner-writable only

### Requirement: Recoverable migrations
The migration command SHALL create a timestamped backup of a non-empty database before applying migrations and SHALL fail without starting the application when backup or migration fails.

#### Scenario: Migrating existing data
- **WHEN** migrations run against a non-empty database
- **THEN** a backup is completed before any migration statement is applied

### Requirement: Control-plane data model
The database SHALL represent administrators, refresh sessions, API tokens, nodes, remote snapshots, managed clients, placements, operation attempts, subscription tokens, sync runs, and scheduler leases without storing generated VPN configuration bodies.

#### Scenario: Inspecting persisted client data
- **WHEN** a remote client snapshot or placement is stored
- **THEN** it contains public metadata and desired editable state but no downloaded `.conf` or QR payload

### Requirement: Storage health signal
The panel SHALL expose a health endpoint that checks SQLite availability without returning database contents or filesystem paths.

#### Scenario: Healthy database
- **WHEN** the panel can execute a trivial SQLite query
- **THEN** `/healthz` returns a successful status with `{ "status": "ok" }`
