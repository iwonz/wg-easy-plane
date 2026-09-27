## 1. Subscription credentials

- [x] 1.1 Implement subscription-specific HKDF keys, AES-256-GCM token encryption, keyed hashes, JWT signing/verification, and deterministic crypto tests.
- [x] 1.2 Implement atomic create/rotate, repeat link retrieval, revoke, rate-limited exchange, and current-version session authentication with race, expiry, revoke, rotate, and plaintext-persistence tests.

## 2. Read-only domain

- [x] 2.1 Implement a privacy-safe client/placement subscription summary and verify disabled, expired, deleting, missing, drift, and unavailable-node states.
- [x] 2.2 Scope live configuration and QR delivery to the session client, block unavailable access, and verify bytes remain transient.

## 3. Typed API

- [x] 3.1 Add OpenAPI contracts for admin link lifecycle, exchange/logout, summary, configuration, and QR, then regenerate the typed client without drift.
- [x] 3.2 Implement authorization, subscription cookie handling, anti-cache headers, safe errors, and scope enforcement with focused API tests.

## 4. Verification and delivery

- [x] 4.1 Exercise fragment-style exchange, immediate rotate/revoke invalidation, summary, config, and QR against synthetic data without retaining tokens or artifacts.
- [x] 4.2 Run strict OpenSpec validation, formatting, lint, typecheck, all tests, both builds, gitleaks, and privacy inspection.
- [x] 4.3 Archive the change, fast-forward into clean `master`, rerun `pnpm verify`, push, and remove the task branch.
