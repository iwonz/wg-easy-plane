# Design: System E2E and hardening

## Hermetic browser system

Playwright runs both Next.js applications and a purpose-built in-memory upstream server. The mock exposes two independent ports representing WireGuard and AmneziaWG nodes, returns the exact pinned 15.4.0 schemas, starts with the same synthetic client name on both nodes, and implements only the adapter operations used by the tests. It never contacts a real node and never writes request or response bodies.

Each Playwright invocation creates a unique operating-system temporary directory for SQLite, sets a synthetic encryption key and origins in child-process environment, disables the scheduler, and removes the directory in global teardown. Test reporting is console-only; screenshots, video, traces, HAR, downloads, and HTML reports are disabled. The browser suite records only request URLs in memory to prove a subscription fragment never crosses HTTP and checks browser storage for the same token before discarding it.

One serial release journey creates the sole administrator through UI, seeds both nodes through authenticated same-origin API calls, verifies duplicate remote names remain separate, creates a multi-node managed client, and traverses the subscription application in Russian. Configuration and QR payloads are fetched and asserted only in browser memory. Revocation is checked against the already-issued subscription session. A clean French browser proves English fallback and no locale route prefix. Axe scans the stable panel and subscription states for serious or critical violations.

## Focused coverage and traceability

Vitest V8 coverage includes security and stateful server modules in `auth`, `nodes`, `wg-easy-adapter`, panel API, and subscription BFF. Generated contracts, fixtures, UI components, barrel files, and test code are excluded. Repository-level thresholds guard this selected surface; the UI is protected by critical Playwright scenarios instead of a misleading global percentage.

A testing document maps every roadmap scenario—including rare timeout, TLS, partial failure, drift, tombstone, replay, and privacy cases—to the focused unit/integration file or E2E assertion that proves it.

## HTTP hardening

A shared configuration helper supplies both Next.js applications with CSP, frame, MIME-sniffing, referrer, permissions, opener, resource, and HSTS headers. CSP allows only the same origin plus the inline script/style behavior required by Next.js and Mantine, blocks plugins, embedding, external connections, and unexpected form targets. API-level private/no-store rules remain more specific and are verified independently.

## Containers and repository privacy

A Node smoke script assigns unique Compose project/image tags and free host ports, validates panel-only startup, enables the optional subscription profile, checks health/non-root identity/internal BFF connectivity, restarts the panel to verify state persistence, and removes containers, networks, volumes, and tags in `finally`.

The privacy audit examines tracked and candidate files, rejects forbidden artifact filenames, absolute user-home paths, private-key blocks, and obvious non-synthetic subscription/PAT literals. Gitleaks remains the entropy/credential scanner. CI never uploads Playwright output or service logs, and Docker smoke state exists only in a disposable named volume.
