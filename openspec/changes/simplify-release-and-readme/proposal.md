## Why

The current Release Please workflow keeps a long-lived release pull request open, duplicates release work across workflows, and makes the public project entry point harder to understand than necessary. Releases and onboarding should be automatic, predictable, and concise for both operators and contributors.

## What Changes

- Replace Release Please and its manifest/configuration with automatic semantic-release execution after successful master CI.
- Generate SemVer tags, `CHANGELOG.md`, package version updates, and GitHub Releases directly from Conventional Commits without release pull requests.
- Publish versioned `panel` and `subscription` GHCR images from the same verified release workflow with existing SBOM and provenance guarantees.
- Rewrite the README around a short project description, Docker and Compose deployment shapes, local development, and contribution entry points.
- Add an ImageGen-created project logo and thematic README hero using synthetic, text-free imagery.
- Retire the existing Release Please pull request and its automation branch once the replacement is ready to merge into `master`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `container-and-release-delivery`: Replace release-PR delivery with post-CI semantic releases and define a concise public README entry point for supported container and development workflows.

## Impact

GitHub Actions CI/release jobs, release configuration, changelog/version automation, GHCR publication, README content, and public image assets are affected. Runtime APIs, SQLite data, authentication, and wg-easy 15.4.0 compatibility do not change. Generated artwork contains no real infrastructure, identities, credentials, configurations, or QR data.
