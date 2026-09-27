# Design: Subscription access API

## Token lifecycle

Each managed client can have one `wgep_sub_` token. Rotation creates 32 random bytes, stores an HMAC-SHA-256 digest under a subscription-specific HKDF key, encrypts the complete token with AES-256-GCM under a separate HKDF key and associated data containing the token-row ID, increments the version, and clears a previous revocation. The administrator-facing metadata endpoint decrypts only an active token and returns the configured subscription URL with the token in its fragment.

`SUBSCRIPTION_PUBLIC_URL` remains optional because the subscription application is optional. Link rotation returns a conflict until that URL is configured. Token lookup and all error responses are independent of the plaintext token.

## Exchange and session

`POST /api/v1/subscriptions/exchange` accepts the fragment token in a JSON body intended for a same-origin subscription BFF. The endpoint is rate limited by a keyed, non-reversible identity and returns only the session expiry timestamp. The signed JWT is placed in `Set-Cookie` as `wgep_subscription`, `HttpOnly`, `Secure`, `SameSite=Lax`, path `/`, with a 12-hour lifetime. The BFF copies this cookie onto its own response; browser code never receives the JWT.

The JWT uses a subscription-specific signing key, issuer/audience, and claims for managed-client ID, token-row ID, token version, and JWT ID. Every protected request verifies the signature and expiry and then checks the current database row. Rotation changes the version and revocation sets `revoked_at`, so existing sessions fail immediately without maintaining a session table.

## Read model and live delivery

The subscription summary exposes only the managed client name, expiration/enabled/lifecycle status, and one entry per node containing the placement ID, node display name, WireGuard/AmneziaWG mode, and a safe availability status. It excludes node host/port, remote IDs, credentials, desired payloads, and upstream bodies.

Artifact routes take only a placement ID; the managed-client ID comes from the validated session. A subscription wrapper blocks configuration and QR delivery when the client is disabled, expired, deleting, or the placement is unavailable, then delegates to the existing live delivery service. Artifact bytes remain in memory and are never stored.

## API and privacy

Administrator link routes accept an admin cookie or PAT with `subscriptions:read`/`subscriptions:write`. Subscription routes accept only the dedicated session cookie. All success and error responses set `Cache-Control: private, no-store`, `Pragma: no-cache`, and `Expires: 0`; artifact responses retain strict media types and safe attachment filenames.

The panel never logs tokens, cookies, JWTs, links, artifact bytes, node endpoints, or upstream bodies. Tests use deterministic synthetic secrets and inspect persistence only for absence of plaintext.
