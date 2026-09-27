# Design: Subscription application

## Fragment exchange

The browser receives the subscription token only in `window.location.hash`, which browsers omit from HTTP requests. On first mount the MobX store copies the value into a function-local variable, synchronously calls `history.replaceState` with the path and query only, validates the exact token format, posts it to `/api/session/exchange`, and drops the local reference. The token and session JWT are never placed in component state, MobX observables, local/session storage, IndexedDB, route query parameters, or logs.

The exchange BFF sends the token in a JSON body to the fixed `CONTROL_PLANE_INTERNAL_URL`, validates the safe expiry body, and copies only the panel's `wgep_subscription` Set-Cookie header to the browser. The cookie is HttpOnly, so client JavaScript cannot read the JWT.

## BFF boundary

Browser requests use only same-origin subscription routes. The BFF forwards exactly one named session cookie to fixed panel paths, follows no redirects, uses a ten-second timeout, requests no caching, and never forwards arbitrary browser authorization or proxy headers. JSON responses are validated with shared Zod contracts. Binary responses are streamed and only allowlisted content type, disposition, anti-cache, and cookie-clearing headers are copied.

All BFF success and error responses use `private, no-store`, `no-cache`, and zero expiry. Upstream failures become generic unavailable responses without the internal origin, cookies, tokens, bodies, or network diagnostics.

## Read-only UI

The UI has explicit exchanging/loading, ready, invalid/revoked, and unavailable states. Ready state displays the managed client's enabled/expiry status and one card per placement with node name, WireGuard/AmneziaWG mode, safe availability, configuration download, ephemeral QR modal, and a link to the official client installation page. Unavailable cards stay visible but disable artifact controls.

Theme and locale reuse the shared Mantine/next-intl shell. Locale remains cookie/browser-derived with English fallback and no locale segment in the URL.

## Administrator link controls

The panel opens a modal per managed client, reads its subscription state, and can rotate, copy, or revoke the link through existing typed endpoints. The full URL exists only in React component memory while the modal is open and is never written to browser storage or logs.
