# Proposal: Ship containers and releases

## Why

The applications build as standalone Next.js servers, but operators do not yet have reproducible rootless images, a safe first-start database path, or an automated and verifiable release channel. The repository also needs an explicit compatibility reminder when wg-easy moves beyond the pinned 15.4.0 contract.

## What changes

- Add independently runnable rootless `panel` and `subscription` OCI image targets with health checks, minimal runtime contents, and automatic pending SQLite migrations for the panel.
- Add Docker Compose with the panel enabled by default and the subscription application behind an explicit optional profile.
- Document secure `docker run` and Compose operation, persistent data, required secrets, upgrades, backups, and reverse-proxy privacy requirements.
- Add Release Please SemVer automation and publish both images to GHCR with immutable/version aliases, OCI metadata, SBOMs, and build provenance.
- Add a scheduled, idempotent upstream release check that opens a compatibility-review issue when the latest wg-easy release differs from 15.4.0.
- Extend CI with deterministic container builds and configuration validation.

## Impact

- Runtime configuration gains an optional absolute migrations directory used by packaged panel deployments.
- Panel startup applies only pending migrations and creates a pre-migration backup when an existing database actually needs a migration.
- Repository delivery gains a multi-target Dockerfile, Compose definition, release configuration, changelog, and GitHub Actions workflows.
- The supported upstream contract remains exactly wg-easy 15.4.0; the scheduled check only reports newer releases and never changes compatibility automatically.
