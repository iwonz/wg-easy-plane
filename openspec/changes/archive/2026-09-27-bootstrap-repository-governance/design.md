## Context

The remote repository and local workspace contain only the initial empty commit. OpenSpec 1.11 is available locally, and all future work is intended to be performed by agents in a public repository with no live-node fixtures.

## Goals / Non-Goals

**Goals:**

- Make the required sequential workflow discoverable to every agent and contributor.
- Keep `master` free of unfinished OpenSpec changes.
- Make common secret and personal-data artifacts ignored and detectable.
- Preserve a clear audit trail through Conventional Commits and archived specs.

**Non-Goals:**

- Add application runtime code, package dependencies, or deployment workflows.
- Configure GitHub branch protection, repository secrets, or other account-level settings.
- Store encrypted production environment files in the repository.

## Decisions

### Keep the roadmap outside active OpenSpec changes

The ordered backlog lives in `docs/roadmap.md`. A change is created only after its branch starts and is archived before merge. Pre-creating every change was rejected because it would leave persistent unfinished state on `master`.

### Use repository instructions as the workflow entry point

`AGENTS.md` carries mandatory agent rules, while `CONTRIBUTING.md` explains the same lifecycle to human contributors. This avoids relying on local, non-versioned assistant configuration.

### Use layered privacy controls

Ignore rules prevent common artifacts from being staged, `.gitleaks.toml` gives local and CI scanners a stable policy, and the workflow requires a final diff and secret scan. Any single layer can miss a novel file, so review remains mandatory.

### Keep environment templates inert

`.env.example` is the only allowed environment-style file. It contains names and explanatory placeholders only; it never contains a working key. Production secret management remains a deployment concern.

## Risks / Trade-offs

- [A contributor bypasses the documented workflow] -> CI and review will later enforce the same validation commands.
- [Ignore patterns hide a fixture that should be committed] -> Synthetic fixtures use explicit JSON/TypeScript paths rather than secret-like extensions.
- [Fast-forward merge fails because `master` moved] -> Stop, update the branch from the new `master`, rerun checks, and only then integrate.
- [OpenSpec initialization cannot write tool-specific local files] -> Keep the portable repository OpenSpec structure; agent-specific configuration is optional and untracked.

## Migration Plan

1. Add governance and privacy files on the bootstrap branch.
2. Validate the change, run secret scanning if available, and archive it.
3. Fast-forward it into the initial `master` and use the documented lifecycle for every later roadmap item.
