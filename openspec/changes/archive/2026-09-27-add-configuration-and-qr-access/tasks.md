## 1. Domain and upstream access

- [x] 1.1 Add compatible node-service configuration and QR methods and verify adapter delegation, safe failure mapping, and no persistence with focused node tests.
- [x] 1.2 Implement managed and discovered target resolution plus filename sanitization and verify eligible, linked, missing, malformed, and hostile-name cases with delivery-service tests.

## 2. Typed delivery API

- [x] 2.1 Add strict binary-response OpenAPI routes for managed and discovered configuration and QR access and verify generated artifacts contain all four paths.
- [x] 2.2 Implement `clients:read` authorization, private anti-cache headers, attachment metadata, and safe error mapping and verify response bytes, media types, scopes, headers, and upstream failure envelopes with API tests.

## 3. Panel delivery experience

- [x] 3.1 Add localized managed-placement and discovered-client download and ephemeral QR controls and verify controls appear only for eligible records in a real browser.
- [x] 3.2 Exercise managed and discovered configuration downloads and QR display against a synthetic wg-easy node and verify SQLite, browser persistence, logs, and retained artifacts contain no payload bytes.

## 4. Verification and delivery

- [x] 4.1 Run `openspec validate add-configuration-and-qr-access --strict`, deterministic OpenAPI generation, formatting, lint, typecheck, all tests, and both production builds.
- [x] 4.2 Run gitleaks and privacy inspection, archive the OpenSpec change, fast-forward into clean `master`, rerun `pnpm verify`, push, and remove the task branch.
