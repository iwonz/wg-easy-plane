## MODIFIED Requirements

### Requirement: Localized managed-client UI

The panel SHALL provide localized English and Russian managed-client listing, creation with node selection and optional expiration, common update, enable/disable, retry, ambiguous recovery, placement removal, and tombstone deletion controls. Managed-client row actions SHALL use accessible icon controls with localized labels or tooltips, and the view SHALL not repeat a Clients heading beneath the primary Clients tab.

#### Scenario: Partial outcome is displayed

- **WHEN** a multi-node operation succeeds on one node and fails on another
- **THEN** the UI displays both node-specific states and offers retry only where safe

#### Scenario: Managed-client actions are displayed

- **WHEN** a managed-client row is rendered
- **THEN** its available actions use recognizable icons with accessible localized names and no redundant Clients content heading

#### Scenario: Managed state is inspected in the browser

- **WHEN** lifecycle operations complete
- **THEN** credentials, Authorization values, configurations, QR payloads, and raw upstream bodies are absent from routes and browser persistence
