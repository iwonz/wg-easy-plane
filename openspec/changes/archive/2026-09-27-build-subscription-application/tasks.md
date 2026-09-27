## 1. BFF and runtime configuration

- [x] 1.1 Add a subscription-app runtime parser for a fixed control-plane HTTP(S) origin and focused validation tests.
- [x] 1.2 Implement redirect-blocked, timeout-bounded, no-store BFF helpers that forward only the subscription cookie and sanitize upstream failures.
- [x] 1.3 Implement exchange/logout, summary, configuration, and QR route handlers with contract validation, cookie copying/clearing, strict media types, and route tests.

## 2. Subscription experience

- [x] 2.1 Implement the fragment-clearing MobX lifecycle without persistent token/JWT state and verify exchange, existing session, invalid, revoked, and unavailable flows.
- [x] 2.2 Build localized responsive client/placement cards, expiration and availability states, live config links, ephemeral QR modal, official app links, and logout.

## 3. Administrator controls

- [x] 3.1 Add a localized panel dialog for inspect/create/copy/rotate/revoke subscription links and integrate it into active managed-client cards.
- [x] 3.2 Verify that full fragment URLs remain only in transient component state and all control requests use existing admin/PAT authorization rules.

## 4. Verification and delivery

- [x] 4.1 Run a real-browser panel-plus-subscription flow proving the fragment is removed before exchange, no token appears in URLs/logs/storage, and config/QR work through the BFF.
- [x] 4.2 Verify Russian browser locale, English fallback, light/dark/system themes, unavailable-node states, accessibility smoke, and standalone subscription startup.
- [x] 4.3 Run strict OpenSpec validation, formatting, lint, typecheck, all tests, both builds, gitleaks, and privacy inspection.
- [x] 4.4 Archive the change, fast-forward into clean `master`, rerun `pnpm verify`, push, and remove the task branch.
