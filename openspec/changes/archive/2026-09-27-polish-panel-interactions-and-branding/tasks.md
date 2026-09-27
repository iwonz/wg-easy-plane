## 1. Shared shell behavior

- [x] 1.1 Add an application-scoped locale controller that switches between bundled English and Russian messages without navigation, and verify it with focused shared UI unit tests.
- [x] 1.2 Add reusable connected-tab styling and global bold modal-title styling, and verify theme and shell component tests pass.
- [x] 1.3 Update panel and subscription providers and compact controls to persist locale changes in place, and verify both applications switch visible text without a reload in Playwright.

## 2. Panel interaction polish

- [x] 2.1 Update the common panel header with the project name and icon-labelled separator-free profile menu, and verify setup, login, and authenticated shell tests.
- [x] 2.2 Convert the main navigation to connected segmented tabs and remove redundant Nodes and Clients content headings, and verify tab keyboard/click behavior in Playwright.
- [x] 2.3 Convert node and managed/discovered client row operations to accessible icon actions, and verify localized labels, tooltips, disabled states, and existing action flows with component and end-to-end tests.
- [x] 2.4 Shorten the Russian add-node title and verify both locale dictionaries remain complete through typecheck and UI assertions.

## 3. Coordinated branding assets

- [x] 3.1 Generate and visually inspect a text-free project mark, replace panel and documentation logo assets, and verify the image loads in the panel header and README.
- [x] 3.2 Generate and visually inspect a coordinated synthetic README control-plane illustration, and verify the tracked asset contains no text, identifiers, endpoints, configuration, or QR-like payload.

## 4. Verification and integration

- [x] 4.1 Keep the local production/E2E launcher compatible with Next.js standalone output, then run strict OpenSpec validation plus format, lint, typecheck, focused and full unit/integration coverage, E2E, and production builds; verify every command succeeds.
- [x] 4.2 Inspect the final diff and ignored files, run gitleaks and the privacy audit, and verify no local environment values, credentials, node data, VPN artifacts, browser recordings, or screenshots are tracked.
- [x] 4.3 Archive the OpenSpec change, fast-forward it into clean `master`, rerun the merged smoke checks, push, and verify the temporary branch is removed.
