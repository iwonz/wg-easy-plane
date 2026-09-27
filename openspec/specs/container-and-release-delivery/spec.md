# container-and-release-delivery Specification

## Purpose

Define reproducible, privacy-preserving container deployment and automated release requirements for the independent panel and subscription applications, including safe SQLite startup, optional Compose topology, SemVer delivery, supply-chain attestations, and upstream compatibility monitoring.

## Requirements

### Requirement: Applications ship as independent rootless images

The repository SHALL build separate `panel` and `subscription` OCI images from reproducible named targets. Each image SHALL run as a non-root user, contain only its required standalone application assets, expose an application health check, and require no source checkout or package installation at runtime.

#### Scenario: An operator starts either released image directly

- **WHEN** the operator supplies the documented runtime configuration to the selected image
- **THEN** that application starts independently, reports healthy, and runs without root privileges

### Requirement: Containerized panel startup safely prepares SQLite

The panel image SHALL default to `/data/wg-easy-plane.sqlite`, apply pending migrations before serving API traffic, preserve secure directory and file permissions, and create a sibling backup before modifying an existing database. An up-to-date database SHALL not receive redundant backup files.

#### Scenario: A panel image starts with a persistent database that needs migration

- **WHEN** the mounted non-empty database has unapplied bundled migrations
- **THEN** startup creates a permission-restricted backup beside it, applies migrations transactionally, and only then serves a healthy response

#### Scenario: A restarted panel is already current

- **WHEN** no bundled migration is newer than the recorded database migration
- **THEN** startup leaves the database intact and creates no additional backup

### Requirement: Compose keeps the subscription application optional

The repository SHALL provide a Compose definition that starts the panel by default with persistent data and starts the subscription application only through a named profile. It SHALL use private service discovery for BFF-to-panel traffic and harden both containers with dropped capabilities, no privilege escalation, read-only roots, and bounded writable mounts.

#### Scenario: Operators select a deployment shape

- **WHEN** Compose starts without profiles
- **THEN** only the panel starts
- **WHEN** Compose starts with the documented subscription profile
- **THEN** the panel and subscription application start and the latter reaches the former through the Compose network

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

### Requirement: CI validates container delivery without secrets

Pull-request and master CI SHALL build both final container targets and validate the Compose model with synthetic configuration without pushing, contacting real nodes, or placing credentials in image layers or artifacts.

#### Scenario: A delivery change is proposed

- **WHEN** CI evaluates the revision
- **THEN** both images build and Compose resolves using only explicit synthetic values

### Requirement: Upstream version changes create one review signal

A scheduled and manually runnable workflow SHALL compare the latest public wg-easy release with supported version 15.4.0 and create at most one open compatibility-review issue per observed version. The workflow SHALL never automatically widen the supported-version gate.

#### Scenario: A different upstream release is latest

- **WHEN** the workflow observes a latest version other than 15.4.0 and no matching open review issue exists
- **THEN** it opens a safe issue naming both versions and public upstream links

#### Scenario: The same release is checked again

- **WHEN** a matching open review issue already exists
- **THEN** the workflow exits without creating a duplicate or modifying compatibility code

### Requirement: Deployment documentation protects private material

Operator documentation SHALL cover secure key generation, persistent storage, direct and Compose startup, upgrades, backups, reverse-proxy header and subscription-URL log suppression, and the prohibition on committing environment files, databases, logs, configuration artifacts, or QR output.

#### Scenario: An operator follows the documented deployment

- **WHEN** the operator prepares a deployment from a clean clone
- **THEN** secrets and personal node/client data remain outside the repository and durable state remains in an explicit external volume

### Requirement: The public README is a concise project entry point

The repository SHALL provide a concise README containing the project purpose, generated project branding, direct Docker and Compose commands for running the panel and optional subscription application separately or together, local development startup, and a contribution entry point. Commands and examples SHALL use placeholders only and SHALL NOT expose operational data or usable secrets.

#### Scenario: A new operator opens the repository

- **WHEN** the operator reads the README from top to bottom
- **THEN** they can identify the project, choose panel-only or panel-plus-subscription deployment, configure local development, and find the contribution workflow without consulting release internals

#### Scenario: A subscription application is deployed separately

- **WHEN** an operator already has a reachable panel API
- **THEN** the README documents how to start only the subscription image with either Docker or Compose and the panel's internal URL supplied explicitly
