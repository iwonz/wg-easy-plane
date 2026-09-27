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

Conventional Commits on `master` SHALL feed Release Please so approved release pull requests create a changelog, SemVer `v` tag, and GitHub release. Each release SHALL publish separate panel and subscription images to GHCR with immutable and version aliases, OCI metadata, an attached SBOM, and cryptographically verifiable build provenance.

#### Scenario: A release is created

- **WHEN** Release Please emits a new SemVer release
- **THEN** both image targets are built from that tag, published under their own GHCR names, and associated with SBOM and provenance attestations for the pushed digest

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
