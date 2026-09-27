## MODIFIED Requirements

### Requirement: Authentication-aware panel entry
The panel UI SHALL show setup on an unconfigured installation, login to an unauthenticated returning administrator, and the authenticated panel shell to a valid session without placing locale identifiers in the URL. The setup form SHALL omit a first-run badge and SHALL label its submit action `Create` in English and `Создать` in Russian. The authenticated shell SHALL omit the introductory project and signed-in identity card, SHALL open with outer `Nodes` and `Clients` tabs on `Nodes`, and SHALL expose an avatar menu containing exactly the token-management action, a separator, and logout.

#### Scenario: First browser visit
- **WHEN** an unauthenticated browser opens a fresh panel installation
- **THEN** it sees the localized administrator setup form without a first-run badge and with the shortened create action

#### Scenario: Returning browser without a session
- **WHEN** an unauthenticated browser opens an already configured panel
- **THEN** it sees the localized login form

#### Scenario: Authenticated panel visit
- **WHEN** a browser with a valid administrator session opens the panel
- **THEN** it sees the Nodes tab selected, a Clients tab, no introductory project card, and the avatar menu

#### Scenario: Avatar menu is opened
- **WHEN** the administrator activates the avatar
- **THEN** the menu contains the localized token-management action, a separator, and the localized logout action with no other entries

#### Scenario: Logout from avatar menu
- **WHEN** the administrator activates logout in the avatar menu
- **THEN** the browser session is invalidated and the panel displays the appropriate unauthenticated form
