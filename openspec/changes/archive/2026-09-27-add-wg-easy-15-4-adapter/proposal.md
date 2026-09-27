## Why

Node and client features need one audited boundary around wg-easy's explicitly unstable API instead of duplicating unaudited HTTP calls throughout the panel. Pinning that boundary to the verified `v15.4.0` source makes incompatibility fail closed before any remote mutation is attempted.

## What Changes

- Add a standalone wg-easy adapter package pinned to the observable API contract of exactly version `15.4.0`.
- Add Basic Authentication, a 10-second default timeout, blocked redirects, trusted TLS by default, and explicit per-instance insecure TLS support.
- Add strict schemas for information, client inventory, create, full update, enable, disable, delete, configuration download, and QR SVG endpoints used by the roadmap.
- Detect WireGuard versus AmneziaWG from `/api/information` and block every unsupported version or malformed response before mutation.
- Convert upstream failures into stable sanitized error codes without retaining credentials, node URLs, response bodies, configurations, QR payloads, or Authorization values.
- Add synthetic contract fixtures and transport/adapter tests, including indistinguishable invalid-password and 2FA Basic Auth rejection.

## Capabilities

### New Capabilities

- `wg-easy-adapter`: Version-pinned, schema-validated, privacy-safe communication with the wg-easy 15.4.0 API.

### Modified Capabilities

None.

## Impact

- Adds `packages/wg-easy-adapter` with no dependency on panel UI or storage.
- Establishes the internal types and safe error vocabulary consumed by later node, sync, client lifecycle, and live delivery changes.
- Uses only synthetic documentation-range addresses and identifiers in fixtures; no live node data or response recordings enter the repository.
- The upstream API remains unstable and Basic Auth cannot distinguish an invalid credential from an account protected by 2FA, so both are reported as a safe authentication failure.
