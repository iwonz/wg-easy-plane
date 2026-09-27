## Why

Authentication, node synchronization, and client lifecycle features need durable storage and validated secrets before they can be implemented safely. The database must never default into the public source tree.

## What Changes

- Add fail-fast runtime environment parsing with an external platform data-directory default.
- Add SQLite persistence with WAL, foreign keys, busy timeout, secure file permissions, migrations, and pre-migration backups.
- Add the initial schema for administrators, tokens, nodes, snapshots, managed clients, placements, operations, subscriptions, and synchronization.
- Add a database health endpoint and migration CLI.

## Capabilities

### New Capabilities

- `runtime-storage`: Defines runtime configuration and durable local storage behavior.

### Modified Capabilities

None.

## Impact

- Adds config and database workspace packages, a native SQLite dependency, migration artifacts, runtime scripts, and `/healthz`.
- Adds environment variable names but no usable secret values.
