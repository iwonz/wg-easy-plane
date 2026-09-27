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

Both applications SHALL provide English and Russian messages without adding a locale segment to URLs. The initial locale SHALL use a supported browser preference and SHALL otherwise fall back to English.

#### Scenario: Russian browser preference

- **WHEN** a new request prefers Russian and has no locale cookie
- **THEN** the application renders Russian messages at the unchanged pathname

#### Scenario: Unsupported browser preference

- **WHEN** a new request prefers an unsupported language
- **THEN** the application renders English messages at the unchanged pathname

### Requirement: Color scheme support

Both applications SHALL support light, dark, and system color schemes and SHALL avoid an incorrect-color flash during initial rendering.

#### Scenario: System color scheme

- **WHEN** the user selects the system color scheme
- **THEN** the application follows the browser preference and persists the selection

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
