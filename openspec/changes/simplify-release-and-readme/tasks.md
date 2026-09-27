## 1. Simplified release delivery

- [x] 1.1 Replace Release Please with semantic-release configuration and post-verification CI jobs for GitHub Releases and both GHCR images; verify with actionlint, configuration parsing, and workflow diff review
- [x] 1.2 Remove the standalone release workflow and Release Please state, then verify `rg` finds no active Release Please integration

## 2. Public project entry point

- [x] 2.1 Generate, inspect, and save a text-free project logo and thematic hero under `docs/assets`; verify file metadata, visual content, and privacy audit results
- [x] 2.2 Replace README content with concise project, Docker/Compose, development, and contributing instructions; verify formatting and Compose commands with synthetic configuration

## 3. Verification and migration

- [x] 3.1 Run strict OpenSpec validation, full project verification, coverage, browser E2E, container smoke, actionlint, gitleaks, and privacy checks
- [x] 3.2 Close release pull request #1 and remove its automation branch after the replacement is ready for `master`; verify the pull request is closed
