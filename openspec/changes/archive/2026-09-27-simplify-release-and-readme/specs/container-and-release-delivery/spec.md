## ADDED Requirements

### Requirement: The public README is a concise project entry point

The repository SHALL provide a concise README containing the project purpose, generated project branding, direct Docker and Compose commands for running the panel and optional subscription application separately or together, local development startup, and a contribution entry point. Commands and examples SHALL use placeholders only and SHALL NOT expose operational data or usable secrets.

#### Scenario: A new operator opens the repository

- **WHEN** the operator reads the README from top to bottom
- **THEN** they can identify the project, choose panel-only or panel-plus-subscription deployment, configure local development, and find the contribution workflow without consulting release internals

#### Scenario: A subscription application is deployed separately

- **WHEN** an operator already has a reachable panel API
- **THEN** the README documents how to start only the subscription image with either Docker or Compose and the panel's internal URL supplied explicitly

## MODIFIED Requirements

### Requirement: Releases are SemVer-tagged and supply-chain verifiable

Conventional Commits on `master` SHALL be analyzed for a release only after all required CI jobs succeed. Releasable commits SHALL automatically update the changelog and package version, create a SemVer `v` tag and GitHub Release without a release pull request, and then publish separate panel and subscription images to GHCR with immutable and version aliases, OCI metadata, an attached SBOM, and cryptographically verifiable build provenance.

#### Scenario: A release is created

- **WHEN** required CI succeeds for `master` and its Conventional Commits determine a new SemVer version
- **THEN** the changelog, package version, tag, GitHub Release, and both versioned GHCR images are produced automatically without an intermediate release pull request

#### Scenario: Verified commits do not require a release

- **WHEN** required CI succeeds but the commits since the last tag do not determine a new version
- **THEN** no tag, GitHub Release, changelog commit, or container publication is created

#### Scenario: Required verification fails

- **WHEN** any required CI job fails for `master`
- **THEN** release and image publication jobs do not run
