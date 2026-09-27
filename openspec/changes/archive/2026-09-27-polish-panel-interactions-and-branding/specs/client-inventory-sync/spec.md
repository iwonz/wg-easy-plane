## MODIFIED Requirements

### Requirement: Localized inventory and compatibility visibility

The panel SHALL display localized English and Russian discovered-client inventory with node, mode, freshness, and missing state, and SHALL show a global non-sensitive warning while any node is unsupported or API-incompatible. Discovered-client row actions SHALL use accessible icon controls with localized labels or tooltips, and the inventory SHALL not repeat a Clients heading beneath the primary Clients tab.

#### Scenario: Compatible discovered inventory

- **WHEN** synchronized clients are available
- **THEN** the administrator can view each node-client record separately with its last-seen and current or missing state

#### Scenario: Discovered-client actions are displayed

- **WHEN** a discovered-client row has an available action
- **THEN** the action uses a recognizable icon with an accessible localized name and no redundant Clients content heading is rendered

#### Scenario: Global compatibility warning

- **WHEN** at least one node has `unsupported_version` or `api_incompatible` status
- **THEN** the authenticated panel shows a global warning that mutations are blocked without displaying node host, IP, credentials, or upstream response content

#### Scenario: Browser locale and fallback

- **WHEN** the inventory UI is opened with Russian browser locale or an unsupported locale
- **THEN** it uses Russian for the former and English for the latter without adding a locale segment to the route
