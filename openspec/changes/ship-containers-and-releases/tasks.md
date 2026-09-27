## 1. Packaged runtime

- [x] 1.1 Add migration-path validation, pending-migration detection, startup migration, and tests proving backup-on-change but no backup-on-restart.
- [x] 1.2 Configure monorepo standalone tracing and add application health endpoints suitable for container orchestration.
- [x] 1.3 Build separate rootless panel/subscription targets with minimal runtime assets, no embedded secrets, secure writable paths, and image health checks.

## 2. Deployment surfaces

- [x] 2.1 Add a hardened Compose definition with persistent panel data and an optional subscription profile connected through the internal service origin.
- [x] 2.2 Document secure direct `docker run`, Compose modes, key generation, ports/origins, persistence, backup-aware upgrades, and reverse-proxy privacy controls.

## 3. Release automation

- [x] 3.1 Configure Release Please for Conventional Commit-driven SemVer tags, changelog maintenance, and GitHub releases.
- [x] 3.2 Publish both GHCR images from release tags with OCI version aliases, SBOM, maximal provenance, and digest attestations.
- [x] 3.3 Add an idempotent scheduled/manual workflow that opens one review issue per unsupported latest wg-easy release.

## 4. Verification and delivery

- [x] 4.1 Extend CI to validate Compose with synthetic values and build both final image targets without publishing.
- [x] 4.2 Build and run both images locally, verify non-root identity, health, fresh panel migration, restart without redundant backup, and panel-only versus profiled Compose behavior.
- [x] 4.3 Run strict OpenSpec validation, formatting, lint, typecheck, all tests, both production builds, workflow validation, gitleaks, and privacy inspection.
- [ ] 4.4 Archive the change, fast-forward into clean `master`, rerun `pnpm verify`, push, and remove the task branch.
