## Why

Administrators can identify managed and discovered clients but cannot yet retrieve the live connection material needed to install them. This must be added through a deliberately non-persistent proxy so sensitive configuration and QR payloads never enter SQLite, logs, browser storage, or generated test artifacts.

## What Changes

- Add authenticated, scoped endpoints that proxy live `.conf` and validated SVG QR responses for managed placements and current unlinked discovered clients.
- Require a healthy compatible node and a current resolvable remote client for every delivery request.
- Apply private no-store response headers and safe deterministic attachment filenames while preserving the standard safe error envelope.
- Add localized panel download and QR controls for managed placements and discovered clients.
- Verify response privacy, filename sanitization, scope enforcement, and the absence of delivery payloads from persistent state.

## Capabilities

### New Capabilities

- `configuration-delivery`: Authenticated live configuration and QR delivery for administrator-facing managed and discovered client views without persistence.

### Modified Capabilities

None.

## Impact

This change affects shared API contracts and generated clients, the node access boundary, a new delivery domain service, panel API routing, and localized client inventory UI. It adds no database schema or retained artifact data and continues to target only wg-easy 15.4.0.
