## MODIFIED Requirements

### Requirement: Built-in localization

Both applications SHALL provide English and Russian messages without adding a locale segment to URLs. The initial locale SHALL use a supported browser preference and SHALL otherwise fall back to English. Each application SHALL expose one compact action displaying the current locale as `🇬🇧` or `🇷🇺`; activating it SHALL cycle to the other locale, persist the locale cookie, and immediately render that locale without navigation or a document reload.

#### Scenario: Russian browser preference

- **WHEN** a new request prefers Russian and has no locale cookie
- **THEN** the application renders Russian messages at the unchanged pathname and shows the Russian flag action

#### Scenario: Unsupported browser preference

- **WHEN** a new request prefers an unsupported language
- **THEN** the application renders English messages at the unchanged pathname and shows the English flag action

#### Scenario: Locale action is activated

- **WHEN** the user activates the current locale action
- **THEN** the other supported locale is persisted and rendered in place while the current pathname and transient application state remain unchanged

### Requirement: Compact panel header

The panel SHALL render one common header in setup, login, authentication-error, loading, and authenticated states. The header SHALL show the project mark followed by the text `WG Easy Plane` at the left and the compact color-scheme and locale actions at the right; an authenticated state SHALL additionally show a round avatar containing the uppercase first character of the administrator username. The avatar menu SHALL show Tokens and Logout without a separator and SHALL give each item a meaningful leading icon.

#### Scenario: Unauthenticated panel state

- **WHEN** the panel displays setup, login, loading, or an authentication error
- **THEN** the common header shows the project mark, product name, and compact preference actions without an avatar

#### Scenario: Authenticated panel state

- **WHEN** the panel has a valid administrator identity
- **THEN** the common header additionally shows a round avatar derived locally from the username

#### Scenario: Profile menu is opened

- **WHEN** an authenticated administrator opens the avatar menu
- **THEN** Tokens and Logout appear with thematic leading icons and no visual divider between them

## ADDED Requirements

### Requirement: Compact application interaction styling

The panel SHALL present primary Nodes and Clients navigation as connected segmented controls without an underline and SHALL not repeat the active section name as a content heading. Both applications SHALL display modal titles with bold emphasis. Public repository artwork SHALL use one coordinated project mark and control-plane illustration without embedded secrets, endpoint values, client identities, configuration content, or QR payloads.

#### Scenario: Primary panel navigation is displayed

- **WHEN** an authenticated administrator views the panel
- **THEN** Nodes and Clients appear as adjacent connected segments and the active panel does not repeat Nodes or Clients as a heading

#### Scenario: A dialog is opened

- **WHEN** either application opens a modal dialog
- **THEN** its title is rendered with bold emphasis

#### Scenario: Public artwork is inspected

- **WHEN** the logo or README illustration is displayed or committed
- **THEN** it contains only synthetic thematic artwork and no sensitive runtime data
