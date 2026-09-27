# Proposal: Subscription access API

## Why

Managed clients need a revocable, read-only way to see and retrieve their own connection material without receiving administrator credentials. The public subscription application will run separately and must be able to exchange a token from the URL fragment through its BFF without persisting that token or exposing it in access logs.

## What changes

- Add administrator APIs to inspect, create/rotate, and revoke one subscription link per managed client.
- Store only a keyed token hash for authentication and an AES-256-GCM ciphertext for repeat link copying.
- Add a rate-limited fragment-token exchange that returns a 12-hour HttpOnly subscription-session JWT cookie and no secret in the response body.
- Validate every subscription session against the current token row and version so revoke or rotate invalidates it immediately.
- Add read-only subscription summary, live configuration, and live QR endpoints scoped to the managed client in the session.
- Keep every subscription response private/no-store and keep tokens, JWTs, configurations, QR bytes, node endpoints, credentials, and upstream bodies out of logs and error bodies.

## Impact

- New typed OpenAPI contracts and generated client operations.
- New subscription token/session service in the authentication package.
- New subscription summary and scoped delivery service in the node/domain package.
- Panel API runtime and route registration gain subscription dependencies.
- No database migration is required because the encrypted `subscription_tokens` table already exists.
