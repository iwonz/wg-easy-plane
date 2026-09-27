# Proposal: Build the subscription application

## Why

The control plane now issues read-only subscription sessions, but users still need a separate, safe browser experience that consumes fragment links, shows each node independently, and proxies live configuration and QR requests without exposing the panel URL or session JWT to client JavaScript.

## What changes

- Turn the existing subscription Next.js shell into a dedicated BFF application backed only by the panel API.
- Exchange `#wgep_sub_*` fragments through a same-origin BFF, remove the fragment immediately, and retain only an HttpOnly session cookie.
- Add private/no-store BFF routes for summary, logout, configuration download, and QR proxying with strict upstream validation and safe errors.
- Add a MobX read-only UI for client status, per-node availability, configuration download, QR display, official WireGuard/AmneziaWG links, themes, and Russian/English localization.
- Add administrator panel controls to create/copy/rotate/revoke subscription links without persistent browser storage.

## Impact

- The subscription application gains server-only control-plane configuration, BFF route handlers, a MobX store, UI components, and tests.
- The panel client inventory gains a localized subscription-link dialog.
- `CONTROL_PLANE_INTERNAL_URL` is validated separately for the subscription runtime; no SQLite or encryption key is needed by that application.
- No database or public panel API schema change is required.
