# Contributing

WG Easy Plane uses OpenSpec and a strictly sequential change workflow.

## Starting a change

1. Update `master` with a fast-forward pull and verify `git status --short` is empty.
2. Select the next uncompleted item in [docs/roadmap.md](docs/roadmap.md).
3. Create `<type>/<change-id>` from `master`.
4. Run `openspec new change <change-id> --schema spec-driven`.
5. Finish the proposal, specs, design, and tasks before modifying runtime behavior.

Future roadmap items must not be pre-created as active OpenSpec changes.

## Completing a change

1. Implement the scoped behavior and its tests.
2. Run `openspec validate <change-id> --strict` and the relevant project verification commands.
3. Review all changed and untracked files for sensitive data.
4. Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
5. Run `openspec archive -y <change-id>` and commit the archive.
6. Fast-forward the branch into `master`, rerun the smoke checks, push, and remove the branch.

## Test data

Use synthetic names, hosts from RFC 2606/5737 documentation ranges, and local mocks. Never sanitize and commit a recording from a real deployment; create a purpose-built fixture instead.
