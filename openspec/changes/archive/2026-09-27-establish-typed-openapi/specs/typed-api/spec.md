## Purpose

Defines the versioned, machine-readable HTTP interface used by the panel UI, subscription application, external automation, and future MCP tooling.

## ADDED Requirements

### Requirement: Versioned API surface
Product resources SHALL be exposed beneath `/api/v1`, while API documentation SHALL be exposed beneath `/api` without locale-dependent routing.

#### Scenario: Reading system status
- **WHEN** a client sends `GET /api/v1/system/status`
- **THEN** it receives a typed success response describing the application and supported wg-easy contract version

### Requirement: OpenAPI documentation
The system SHALL serve an OpenAPI 3.1 document at `/api/openapi.json` and interactive documentation at `/api/docs` generated from the same schemas used by route handlers.

#### Scenario: Inspecting the contract
- **WHEN** a developer opens `/api/openapi.json`
- **THEN** every implemented API operation, response schema, and declared security scheme is represented without requiring authentication

### Requirement: Correlated safe errors
Every API error SHALL use `{ error: { code, message, details?, requestId } }`, SHALL include the same request ID in a response header, and SHALL NOT expose stack traces, secrets, filesystem paths, or upstream response bodies.

#### Scenario: Unknown route
- **WHEN** a client requests an unknown API resource
- **THEN** it receives the standard `NOT_FOUND` envelope and an `X-Request-Id` header

### Requirement: Typed generated client
The repository SHALL contain a TypeScript client generated from the committed OpenAPI document and SHALL detect uncommitted contract or client drift during verification.

#### Scenario: Route schema changes
- **WHEN** an API schema changes without regenerating artifacts
- **THEN** the API drift check fails

### Requirement: Pagination primitives
List endpoints SHALL use shared cursor-based pagination schemas with a bounded limit and an opaque next cursor.

#### Scenario: Invalid list limit
- **WHEN** a client supplies a limit outside the documented bounds
- **THEN** validation returns the standard safe error envelope
