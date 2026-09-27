## MODIFIED Requirements

### Requirement: Verified integration

Every change SHALL run its relevant lint, type, unit, integration, end-to-end, build, and security checks before merge. Verification tools invoked by package scripts SHALL be declared at exact versions in the workspace and executable after a frozen install without machine-global dependencies. Commits SHALL follow Conventional Commits, and sequential change branches SHALL be integrated into `master` by fast-forward merge.

#### Scenario: Integrating a verified branch

- **WHEN** all checks for the current change pass
- **THEN** its Conventional Commits are fast-forwarded into `master`, the merged state is smoke-tested, and the temporary branch is removed

#### Scenario: Running verification on a clean CI runner

- **WHEN** CI installs the workspace with the frozen lockfile and runs the repository verification script
- **THEN** the pinned project-local OpenSpec CLI validates active and archived specifications without requiring a global executable
