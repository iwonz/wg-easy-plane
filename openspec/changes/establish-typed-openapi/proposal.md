## Why

Every later panel, subscription, automation, and MCP integration depends on a stable, inspectable API contract. Establishing typed schemas and generated clients before adding business endpoints prevents hand-written request/response drift.

## What Changes

- Mount a Hono API under `/api` with versioned resources under `/api/v1`.
- Generate and serve an OpenAPI 3.1 document and interactive Scalar documentation.
- Define request IDs, a safe error envelope, pagination primitives, and future security schemes.
- Generate a typed TypeScript client from the committed OpenAPI document and fail CI on drift.
- Add a public system-status endpoint.

## Capabilities

### New Capabilities

- `typed-api`: Defines API versioning, documentation, errors, request correlation, and generated client guarantees.

### Modified Capabilities

None.

## Impact

- Adds contracts and API-client packages, a Hono route handler inside the panel, OpenAPI generation scripts, and API tests.
- Does not yet grant authenticated access or expose mutable business resources.
