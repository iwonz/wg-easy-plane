## ADDED Requirements

### Requirement: Critical behavior is verified across both applications

The repository SHALL provide a real-browser system suite that runs the panel and subscription application against ephemeral SQLite and two independent synthetic wg-easy 15.4.0 nodes. It SHALL verify first-admin onboarding, distinct same-name discovery, multi-node managed placement, fragment-based subscription access, live configuration and QR proxying, immediate revocation, locale behavior, and theme controls without using a real service.

#### Scenario: The release journey crosses panel and subscription boundaries

- **WHEN** the browser completes onboarding, connects the two mock nodes, creates a managed client, and opens its subscription fragment URL
- **THEN** both placements remain distinct, the fragment is removed before later navigation, live artifacts work only through read-only BFF routes, and revocation invalidates the issued session

#### Scenario: Locale and route behavior are exercised

- **WHEN** Russian and unsupported browser locales visit clean subscription sessions
- **THEN** Russian is selected for the former, English is the fallback for the latter, and neither URL gains a locale prefix

### Requirement: Browser tests produce no sensitive artifacts

System tests SHALL use only documented synthetic identities and addresses, place databases outside the checkout, disable screenshots/video/traces/HAR/download persistence and HTML reports, avoid logging request bodies or credentials, and remove temporary state after execution.

#### Scenario: A browser test succeeds or fails

- **WHEN** the Playwright process exits
- **THEN** no database, configuration, QR, screenshot, recording, storage state, token, or node response artifact remains in the repository

### Requirement: Security-critical modules have focused coverage gates

CI SHALL collect V8 coverage for authentication, domain/node state machines, the wg-easy adapter, panel API security, and subscription BFF modules with enforced branch/function/line/statement thresholds. UI files SHALL be excluded from percentage targets and covered through critical browser flows.

#### Scenario: Security or domain coverage regresses

- **WHEN** selected-module coverage falls below a configured threshold
- **THEN** the coverage job fails with a text summary and does not publish raw coverage artifacts

### Requirement: Both applications enforce browser defense-in-depth headers

Panel and subscription responses SHALL send a common Content Security Policy plus MIME-sniffing, framing, referrer, permissions, opener, resource, and transport-security headers. Sensitive API and subscription responses SHALL continue to send private no-store caching directives.

#### Scenario: A browser requests either application

- **WHEN** the root page or health endpoint responds
- **THEN** the common security headers are present and prohibit embedding, plugins, external base URLs, and cross-origin opener/resource use

### Requirement: Accessibility smoke covers stable application states

The system suite SHALL scan the authenticated panel and active subscription views for serious or critical WCAG violations and SHALL verify primary controls are discoverable by accessible role and name.

#### Scenario: A critical view becomes inaccessible

- **WHEN** Axe or role-based assertions detect a serious/critical issue in a stable tested state
- **THEN** E2E fails before release

### Requirement: Container deployment shapes are smoke-tested and self-cleaning

CI SHALL start the built Compose deployment first without profiles and then with the subscription profile, verify health, non-root execution, persistent panel state, and internal subscription-to-panel connectivity, and SHALL clean its containers, network, volume, and local image tags on success or failure.

#### Scenario: Container smoke runs in CI or locally

- **WHEN** the smoke command completes or encounters an error
- **THEN** it reports the failed boundary, returns the correct exit status, and leaves no test container or durable test volume behind

### Requirement: Release scenarios are traceable and the repository is privacy-audited

The repository SHALL maintain a verification matrix for every required cross-cutting scenario and SHALL run both gitleaks and a deterministic tracked-file audit that rejects forbidden operational artifacts, private-key material, personal home paths, and non-synthetic credential literals.

#### Scenario: An unsafe artifact is introduced

- **WHEN** a candidate tracked file resembles an environment secret, database, backup, VPN configuration, QR/screenshot/recording, private key, personal home path, or literal production-format credential
- **THEN** CI fails and identifies only the safe filename/reason without printing secret contents
