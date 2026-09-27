# application-shell Specification

## Purpose
Defines the shared web application shell so the panel and subscription surfaces provide consistent localization, color-scheme, and runtime behavior.

## Requirements

### Requirement: Independent applications

The system SHALL provide separately buildable and runnable panel and subscription Next.js applications within one workspace.

#### Scenario: Building applications

- **WHEN** the workspace build command runs
- **THEN** both applications and every shared package build successfully from the locked dependency graph

### Requirement: Built-in localization

Both applications SHALL provide English and Russian messages without adding a locale segment to URLs. The initial locale SHALL use a supported browser preference and SHALL otherwise fall back to English. Each application SHALL expose one compact action displaying the current locale as `🇬🇧` or `🇷🇺`; activating it SHALL cycle to the other locale, persist the locale cookie, and reload the unchanged pathname.

#### Scenario: Russian browser preference

- **WHEN** a new request prefers Russian and has no locale cookie
- **THEN** the application renders Russian messages at the unchanged pathname and shows the Russian flag action

#### Scenario: Unsupported browser preference

- **WHEN** a new request prefers an unsupported language
- **THEN** the application renders English messages at the unchanged pathname and shows the English flag action

#### Scenario: Locale action is activated

- **WHEN** the user activates the current locale action
- **THEN** the other supported locale is persisted and rendered after reloading the same non-prefixed pathname

### Requirement: Color scheme support

Both applications SHALL support light, dark, and system color schemes, SHALL avoid an incorrect-color flash during initial rendering, and SHALL expose one compact action whose icon represents the selected scheme. Activating the action SHALL cycle `system` to `light`, `light` to `dark`, and `dark` to `system`, with the selection persisted through the existing color-scheme storage.

#### Scenario: System color scheme

- **WHEN** the user selects the system color scheme
- **THEN** the application follows the browser preference, persists the selection, and shows the system icon

#### Scenario: Color-scheme action is activated repeatedly

- **WHEN** the user activates the color-scheme action three times starting at system
- **THEN** the selected scheme progresses through light and dark and returns to system

### Requirement: Isolated client state

Interactive client state SHALL use MobX stores scoped per application tree and SHALL NOT share mutable singleton state between server-rendered requests.

#### Scenario: Creating an application tree

- **WHEN** a client application tree mounts
- **THEN** it receives its own MobX store instance through React context

### Requirement: Baseline verification

The workspace SHALL expose deterministic format, lint, type-check, unit-test, and production-build commands suitable for local and CI execution.

#### Scenario: Verifying the workspace

- **WHEN** the aggregate verification command runs on a clean checkout
- **THEN** all configured static checks, unit tests, and application builds pass

### Requirement: Compact panel header

The panel SHALL render one common header in setup, login, authentication-error, loading, and authenticated states. The header SHALL show only the existing project logo at the left and the compact color-scheme and locale actions at the right; an authenticated state SHALL additionally show a round avatar containing the uppercase first character of the administrator username.

#### Scenario: Unauthenticated panel state

- **WHEN** the panel displays setup, login, loading, or an authentication error
- **THEN** the common header shows the logo and compact preference actions without an avatar

#### Scenario: Authenticated panel state

- **WHEN** the panel has a valid administrator identity
- **THEN** the common header additionally shows a round avatar derived locally from the username
