## Context

`pnpm verify` calls the OpenSpec CLI directly. pnpm can resolve binaries from root `devDependencies`, but the package was not declared, so local success depended on a global OpenSpec 1.11.0 installation and CI failed on a fresh runner.

## Goals / Non-Goals

**Goals:** make the existing verification command hermetic, retain the repository-standard OpenSpec 1.11 behavior, and keep frozen installs deterministic.

**Non-Goals:** upgrade the OpenSpec schema or change application/runtime behavior.

## Decisions

- Add exact `@fission-ai/openspec@1.11.0` to root `devDependencies` rather than installing a floating CLI in the workflow.
- Invoke validation with `pnpm exec openspec` so scripts explicitly use the workspace binary.
- Keep the package in the existing lockfile and let all CI jobs continue using `pnpm install --frozen-lockfile`.

## Risks / Trade-offs

- The dependency enlarges development installs, but prevents host-dependent validation and avoids an unpinned network install during CI.

## Migration Plan

No runtime migration is required. Existing developers receive the CLI on their next pnpm install.
