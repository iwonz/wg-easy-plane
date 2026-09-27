## MODIFIED Requirements

### Requirement: Localized node administration UI

The panel SHALL provide localized English and Russian node listing, creation, editing, testing, status, and deletion flows through MobX state without placing credentials in URLs or browser persistence. The list SHALL present row-specific actions as accessible icon controls with localized labels or tooltips, SHALL not repeat a Nodes heading beneath the primary Nodes tab, and SHALL label the Russian creation modal `Добавление ноды`.

#### Scenario: Administrator adds a node

- **WHEN** the administrator submits the node modal
- **THEN** the UI displays the persisted safe status and clears password state after the request completes

#### Scenario: Administrator edits a node

- **WHEN** the edit modal opens for an existing node
- **THEN** no credential is prefilled and the administrator can leave credential fields blank to retain stored values

#### Scenario: Node actions are displayed

- **WHEN** a node row is rendered beneath the primary Nodes tab
- **THEN** its available actions use recognizable icons with accessible localized names and no redundant Nodes content heading

#### Scenario: Browser storage is inspected

- **WHEN** node UI operations complete
- **THEN** username, password, Authorization values, and upstream bodies are absent from the route, local storage, and session storage
