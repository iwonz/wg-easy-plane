## 1. Runtime Configuration

- [x] 1.1 Add side-effect-free dotenv loading, Zod validation, safe defaults, and inert `.env.example`; verify valid, missing-secret, malformed-number, and path-resolution tests

## 2. SQLite Persistence

- [x] 2.1 Add the Drizzle schema and initial migration for all planned durable entities; verify migration generation and schema type checks
- [x] 2.2 Add secure database initialization, backup-first migration CLI, and lifecycle helpers; verify temporary-file integration tests cover pragmas, modes, backup, and health

## 3. Panel Integration

- [x] 3.1 Add `/healthz`, Next native-package configuration, and root database scripts; verify a production build and healthy/failed database responses
- [x] 3.2 Run workspace verification, strict OpenSpec validation, and secret scanning, then mark all tasks complete
