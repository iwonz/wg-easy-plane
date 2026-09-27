## Context

The panel is a long-running, single-replica Node.js process. The subscription application must not access the database. Later changes need a schema that can record partial multi-node operations without persisting private configuration files.

## Goals / Non-Goals

**Goals:**

- Provide an external, configurable, recoverable SQLite database.
- Validate configuration at explicit runtime entry points rather than during `next build`.
- Establish all durable identities and state-machine columns needed by the roadmap.

**Non-Goals:**

- Implement authentication, encryption helpers, synchronization, or business operations.
- Support multiple panel replicas or network databases.
- Automatically prune operator backups.

## Decisions

### better-sqlite3 with Drizzle

The synchronous driver provides predictable local transactions and filesystem semantics for a single process. Network/serverless drivers were rejected because this release explicitly targets self-hosted SQLite.

### Explicit configuration loader

The config package loads dotenv only when its loader is called, then validates a supplied environment object with Zod. Imports remain side-effect free so Next.js builds do not create data or require production secrets.

### JSON snapshots with relational identities

Remote public payloads and per-placement desired payloads are JSON because they mirror a versioned upstream contract. Ownership, lifecycle, uniqueness, and retry state remain relational and indexed.

### Backup before migration

The CLI copies a non-empty database before invoking Drizzle migrations. The operation fails closed; silently continuing without a backup was rejected.

## Risks / Trade-offs

- [Native dependency complicates images] -> Pin Node 24 and externalize `better-sqlite3` from the Next bundle.
- [WAL creates sidecar files] -> Keep the database directory persistent and ignore all SQLite sidecars.
- [JSON schema evolves] -> Validate snapshots at the adapter boundary and store an explicit upstream version/hash.
- [File modes vary on Windows] -> Apply permissions where supported and document OS-level access controls.

## Migration Plan

The initial migration creates all tables. Future schema changes must use additive migrations and the same backup-first command.
