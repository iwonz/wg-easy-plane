## Context

See `proposal.md` for the motivation. The repository currently runs Release Please in a dedicated workflow, requires a generated release pull request, and publishes containers only after that pull request is merged. CI already verifies code, browser behavior, coverage, secrets, workflows, and containers independently.

The root package is private and is not published to npm, but its version remains the repository's human-readable release version. Panel and subscription OCI images are the distributable artifacts.

## Goals / Non-Goals

**Goals:**

- Gate every automated release on the existing required CI jobs.
- Derive SemVer from Conventional Commits without a release pull request.
- Keep `CHANGELOG.md`, the root package version, tags, GitHub Releases, and GHCR aliases synchronized.
- Preserve multi-architecture images, SBOMs, provenance attestations, and separate image names.
- Make README onboarding short, copyable, and privacy-safe.
- Add reusable raster branding created with the built-in ImageGen workflow.

**Non-Goals:**

- Publishing JavaScript packages to npm.
- Changing application runtime behavior, supported wg-easy versions, or container hardening.
- Replacing detailed operator, test, security, or agent documentation outside the README.
- Creating screenshots from a live installation.

## Decisions

### Release from the existing CI workflow

The separate release workflow will be removed. A release job in `ci.yml` will depend on every existing required job and will run only for pushes to `master`. A container publication matrix will depend on a newly created release.

This keeps verification, release, and package publication in one visible pipeline. A `workflow_run` chain was rejected because it creates another pipeline and complicates selecting the exact verified commit.

### Use semantic-release without release pull requests

The release job will use semantic-release with its commit analyzer, release-note generator, changelog, non-publishing npm version update, GitHub, and git plugins. It will use `v<version>` tags and commit only `CHANGELOG.md` and `package.json` with a `[skip ci]` release commit.

Release Please was rejected because its release pull request is integral to its operating model. A manual version input was rejected because it duplicates SemVer decisions already encoded by Conventional Commits.

Only the job-scoped GitHub token is used. It receives contents, issues, and pull-request write permissions only in the release job. No npm token is required because npm publication is disabled. Generated release notes contain commit metadata only; environment files and runtime data are neither read nor uploaded.

### Publish containers only from the release output

The existing two-target matrix will consume the semantic-release tag output. Images retain full, major/minor, major, and `latest` aliases plus SBOM and provenance generation. If semantic-release reports no release, the matrix is skipped.

### Keep README intentionally narrow

The README will contain a short purpose statement followed by Docker, Compose, development, and contributing sections. Direct Docker commands will cover panel-only and subscription-only execution; Compose commands will cover panel-only, subscription-only, and combined execution. The subscription service keeps its private in-network panel URL by default but accepts an explicit reachable panel URL when started with `--no-deps`. Detailed operational guidance remains in existing documents but is not duplicated in the README.

The README will reference `docs/assets/logo.png` and `docs/assets/readme-hero.png`. Both assets will be generated with the built-in ImageGen tool, contain no text or third-party marks, and depict only abstract synthetic infrastructure.

## Risks / Trade-offs

- [The release job cannot push its changelog commit to a protected branch] → Grant only job-scoped contents write permission and document that future branch protection must allow the release automation identity or switch changelog storage to release notes only.
- [Generated release commits are not followed by another CI run] → Limit generated changes to `CHANGELOG.md` and `package.json`; all source and workflow content is verified before release.
- [A release succeeds but one image publication fails] → Keep independent matrix entries and fail the workflow visibly; immutable tags make a retry safe after the underlying issue is corrected.
- [Generated artwork resembles an existing mark] → Use abstract geometry, exclude text and third-party logos in prompts, visually inspect outputs, and keep the source prompts in the archived design record.
- [README commands encourage secret reuse] → Use a generated-key command and named placeholders only; never include a usable key, node endpoint, or client identity.

## Migration Plan

1. Add semantic-release configuration and move release/image jobs into CI.
2. Remove Release Please configuration and its standalone workflow.
3. Add branding assets and replace README content.
4. Validate workflow syntax, semantic-release dry-run behavior where safe, container configuration, docs, privacy, and the full project suite.
5. Close pull request #1 and remove its automation branch once the replacement is ready, then merge and push the verified change so CI can create the initial semantic release and images.

Rollback restores the previous workflow and Release Please configuration before any later release. Existing SemVer tags, GitHub Releases, changelog entries, and immutable GHCR images remain valid and are not deleted.
