# Design: Containers and automated releases

## Runtime images

A single multi-stage Dockerfile produces two named final targets. Each final image contains only the selected Next.js standalone server, its static assets, and—for the panel—the immutable Drizzle migration files. Images run as the unprivileged Node user, bind on all interfaces, expose one application port, use a writable `/data` volume only where required, and include application-level health checks.

Next.js output tracing is rooted at the monorepo so native `better-sqlite3` and workspace runtime dependencies are copied into the standalone panel output. The panel receives an explicit container migrations path and applies migrations before constructing services. Migration inspection happens before backup: a fresh database is created directly, an up-to-date database is untouched, and a non-empty database with pending migrations is backed up beside the database before the transaction runs.

## Compose and direct execution

The default Compose graph starts only `panel` with persistent data. `subscription` has a named profile and starts only with `--profile subscription`; it reaches the panel over the private service network while browsers use configured public origins. Both services drop Linux capabilities, prohibit privilege escalation, use read-only root filesystems and temporary `/tmp` mounts, and receive secrets only from runtime environment interpolation.

Direct `docker run` instructions use the same boundaries: an externally generated 32-byte base64 key, an explicit persistent volume, public origin configuration, and no checked-in environment or database files.

## Release channel

Release Please maintains SemVer state, changelog entries, and `vMAJOR.MINOR.PATCH` tags from Conventional Commits. When its release step creates a release, a matrix builds each named target, pushes a distinct GHCR repository with exact, minor, major, and `latest` aliases, and records OCI labels. BuildKit emits an SPDX-compatible SBOM attestation and maximal provenance; GitHub additionally signs an image-digest attestation using OIDC.

Pull-request CI builds both final targets without publishing and validates Compose interpolation using synthetic values. Repository or registry credentials never enter build arguments or image layers.

## Upstream compatibility signal

A weekly and manually dispatchable workflow reads the latest release from GitHub's wg-easy repository with the repository token. When the normalized latest tag is not `15.4.0`, it searches open issues for a deterministic marker before creating one review issue containing only public version metadata and links. It does not update schemas, dependencies, or the supported-version gate.
