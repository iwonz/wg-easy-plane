## Why

The repository verification script invokes `openspec`, but the CLI is currently available only through a developer-global installation. A clean GitHub Actions runner therefore fails after the build with `openspec: not found`, even though the application checks pass.

## What Changes

- Pin the project-standard OpenSpec 1.11 CLI as a root development dependency.
- Execute OpenSpec validation through pnpm's project-local binary resolution.
- Verify a frozen install exposes the pinned CLI without relying on machine-global state.

## Capabilities

### Modified Capabilities

- `repository-workflow`: require verification tools used by package scripts to be declared and reproducible on clean CI runners.

## Impact

Only root tooling metadata, the pnpm lockfile, verification scripts, and workflow documentation are affected. Runtime application bundles and public APIs do not change.
