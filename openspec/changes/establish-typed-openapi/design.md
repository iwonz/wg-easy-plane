## Context

The panel has Next.js and SQLite foundations but no shared HTTP contract. Internal and external consumers need the same schemas, while documentation must remain usable before authentication exists.

## Goals / Non-Goals

**Goals:**

- Derive handler validation and OpenAPI from one source.
- Produce a separately consumable typed client.
- Normalize safe failures before security-sensitive endpoints arrive.

**Non-Goals:**

- Implement JWT, PAT, subscription, node, or client endpoints.
- Add cross-origin browser access.
- Promise compatibility for an unversioned route.

## Decisions

### Hono with Zod OpenAPI

`OpenAPIHono` provides typed route registration and document generation inside a Next route handler. Parallel handwritten OpenAPI files were rejected because they inevitably drift.

### Generate a client from the public document

`openapi-typescript` generates path types and `openapi-fetch` supplies the small runtime. Importing server application types into the subscription app was rejected because it would couple deployment bundles.

### Public documentation

The spec and docs describe an open-source API and contain no runtime data, so they remain public. Actual routes declare and enforce their own security requirements.

### Opaque cursors

Cursors are strings at the contract boundary. Individual list services may encode stable identifiers without exposing that encoding as public API.

## Risks / Trade-offs

- [Generated artifacts become stale] -> `api:check` regenerates them and fails on a Git diff.
- [Unhandled exceptions expose details] -> A single `onError` adapter returns only a generic safe code and request ID.
- [Next catches API paths first] -> One optional catch-all route delegates every `/api/*` request to Hono.

## Migration Plan

No existing API is replaced. Later changes extend the same versioned router and regenerate the client in their own branches.
