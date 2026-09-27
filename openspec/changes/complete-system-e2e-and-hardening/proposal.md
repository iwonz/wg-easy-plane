# Proposal: Complete system E2E and hardening

## Why

The planned product surface is implemented and deployable, but release readiness still depends on one reproducible verification layer that crosses both applications, enforces focused security/domain coverage, exercises the actual browser boundary, validates hardened response headers, runs released container shapes, and proves the repository contains no local operational artifacts.

## What changes

- Add a Playwright system harness that uses only ephemeral SQLite state and two synthetic wg-easy 15.4.0 mock nodes.
- Cover first-admin onboarding, same-name clients on distinct nodes, multi-node managed creation, fragment subscription exchange, live configuration/QR proxying, revocation, locale fallback, unprefixed routes, themes, and accessibility smoke in a real browser.
- Centralize a browser security-header baseline for both applications and verify it at the HTTP boundary.
- Add focused V8 coverage gates for authentication, node/domain state machines, the wg-easy adapter, panel API security, and the subscription BFF while intentionally excluding UI from percentage targets.
- Add a self-cleaning Docker smoke runner for panel-only and panel-plus-subscription deployment shapes.
- Add a tracked-file privacy audit and a verification matrix mapping every required failure/state scenario to automated evidence.
- Wire coverage, browser E2E, container smoke, workflow validation, and privacy checks into CI without retaining browser, database, configuration, QR, or response artifacts.

## Impact

- Development dependencies gain Playwright, Axe, and the matching Vitest V8 coverage provider.
- CI has additional quality gates and downloads a synthetic Chromium runtime only for E2E.
- Both Next.js applications return a consistent CSP and defense-in-depth header set.
- No production data model or public API contract changes.
