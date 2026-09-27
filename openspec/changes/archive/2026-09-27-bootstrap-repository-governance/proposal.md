## Why

The repository is empty and needs a safe, repeatable foundation before feature work begins. Governance must make sequential agent development auditable while preventing credentials, node addresses, databases, and generated connection artifacts from entering the public repository.

## What Changes

- Establish the OpenSpec spec-driven workflow and a just-in-time change lifecycle.
- Define the clean-master, one-change-per-branch, Conventional Commits, validation, archive, fast-forward merge, and cleanup rules.
- Add the MIT license and public contributor/security documentation.
- Add privacy-first ignore rules and secret-scanning configuration for local and CI use.
- Record the ordered implementation roadmap without creating unfinished OpenSpec changes on `master`.

## Capabilities

### New Capabilities

- `repository-workflow`: Defines the required agent development, validation, merge, release hygiene, and sensitive-data handling behavior.

### Modified Capabilities

None.

## Impact

- Adds repository-level documentation, OpenSpec configuration, ignore rules, and security scanning configuration.
- Establishes constraints that all later application, test, CI, and release changes must follow.
- Does not add runtime application behavior or external API surface.
