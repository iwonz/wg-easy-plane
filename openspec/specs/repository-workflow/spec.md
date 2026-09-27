# repository-workflow Specification

## Purpose
Defines the repository workflow and privacy guarantees required for safe, sequential, agent-led development of a public control-plane project.

## Requirements

### Requirement: Sequential change isolation
Every implementation change SHALL start from an up-to-date, clean `master` branch, SHALL use one lowercase kebab-case `<type>/<change-id>` branch, and SHALL keep at most one active OpenSpec change during sequential development.

#### Scenario: Starting a feature change
- **WHEN** an agent begins an implementation task
- **THEN** it verifies a clean `master`, creates a dedicated branch, and creates the matching OpenSpec change before editing runtime code

### Requirement: Spec-driven completion
Every change SHALL contain complete proposal, specification, design when required, and task artifacts before implementation is declared complete. The change SHALL pass strict OpenSpec validation and SHALL be archived before merging.

#### Scenario: Completing a change
- **WHEN** implementation and tests are finished
- **THEN** strict validation succeeds, every task is checked, and the archived specification is included in the branch

### Requirement: Verified integration

Every change SHALL run its relevant lint, type, unit, integration, end-to-end, build, and security checks before merge. Verification tools invoked by package scripts SHALL be declared at exact versions in the workspace and executable after a frozen install without machine-global dependencies. Commits SHALL follow Conventional Commits, and sequential change branches SHALL be integrated into `master` by fast-forward merge.

#### Scenario: Integrating a verified branch

- **WHEN** all checks for the current change pass
- **THEN** its Conventional Commits are fast-forwarded into `master`, the merged state is smoke-tested, and the temporary branch is removed

#### Scenario: Running verification on a clean CI runner

- **WHEN** CI installs the workspace with the frozen lockfile and runs the repository verification script
- **THEN** the pinned project-local OpenSpec CLI validates active and archived specifications without requiring a global executable

### Requirement: Sensitive data exclusion
Repository history SHALL NOT contain real credentials, tokens, node hostnames or addresses, SQLite data, generated VPN configurations, QR payloads, private keys, browser authentication state, or live-system recordings.

#### Scenario: Testing an integration
- **WHEN** automated tests exercise node and client behavior
- **THEN** they use synthetic fixtures and mocks and do not persist live response bodies or connection artifacts

### Requirement: Private environment files
Plaintext environment files SHALL remain untracked. The repository MAY contain only a documented `.env.example` with placeholders and no usable secret values.

#### Scenario: Preparing local configuration
- **WHEN** a developer configures a local runtime
- **THEN** real values are placed in an ignored local environment file and committed documentation contains only variable names and safe placeholders

### Requirement: Just-in-time roadmap execution
The implementation roadmap SHALL be recorded as documentation, while OpenSpec change directories for future tasks SHALL be created only when their branch begins.

#### Scenario: A future task is waiting
- **WHEN** a roadmap item has not started
- **THEN** `master` contains its roadmap entry but no active OpenSpec change directory for it
