## 1. Focused quality gates

- [x] 1.1 Add selected-module V8 coverage configuration, thresholds, and a CI command without imposing a global UI percentage.
- [x] 1.2 Add a deterministic tracked-file privacy audit and document the final verification matrix for all required scenarios.
- [x] 1.3 Centralize browser security headers for both Next.js applications and add response-level tests.

## 2. Hermetic system E2E

- [x] 2.1 Add a stateful two-node wg-easy 15.4.0 mock with exact authenticated CRUD/config/QR behavior and no body logging.
- [x] 2.2 Add a self-cleaning Playwright harness with external temporary SQLite, synthetic environment, console-only reporting, and all recording/download artifacts disabled.
- [x] 2.3 Automate onboarding, same-name discovery, multi-node management, fragment exchange/storage privacy, live BFF artifacts, revocation, themes, Russian/English fallback, unprefixed routes, and Axe smoke.

## 3. Container and CI hardening

- [x] 3.1 Add a unique, self-cleaning Docker Compose smoke runner for panel-only and optional subscription-profile deployments.
- [x] 3.2 Wire verify, focused coverage, Chromium E2E, container smoke, actionlint-compatible workflows, gitleaks, and privacy audit into CI with no sensitive artifact upload.

## 4. Final verification and delivery

- [x] 4.1 Run the entire unit/integration/coverage/browser/container suite and inspect the checkout, temporary paths, logs, Docker state, and git diff for private data or retained artifacts.
- [x] 4.2 Run strict OpenSpec validation, formatting, lint, typecheck, both production builds, API drift, actionlint, gitleaks, and privacy audit.
- [x] 4.3 Archive the change, fast-forward into clean `master`, repeat the full release gate, push, and remove the task branch.
