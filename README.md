# WG Easy Plane

WG Easy Plane is an open-source control plane for managing clients across multiple [wg-easy](https://github.com/wg-easy/wg-easy) WireGuard and AmneziaWG nodes.

The project is built spec-first. The ordered plan lives in the [OpenSpec roadmap](docs/roadmap.md); completed behavior contracts live under `openspec/specs`.

## Deployment

The panel and optional read-only subscription application ship as separate rootless containers. See the [container deployment guide](docs/deployment.md) for direct `docker run`, Compose profiles, required secrets, persistent SQLite storage, upgrades, and reverse-proxy privacy controls.

The control plane intentionally supports exactly wg-easy `15.4.0` in the first release. A newer upstream version is not enabled until its unstable API contract has been reviewed and tested.

## Development policy

- Read [AGENTS.md](AGENTS.md) before agent-led work.
- Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change.
- Report vulnerabilities using [SECURITY.md](SECURITY.md), never a public issue.
- Do not use real node addresses, credentials, clients, VPN configurations, or QR payloads in tests or examples.

## Releases

Releases follow SemVer and are prepared from Conventional Commits by Release Please. GitHub releases publish versioned panel and subscription images to GHCR with SBOM and provenance attestations. Until the first GitHub release appears, build the named `panel` or `subscription` target locally rather than relying on `latest`.

## License

[MIT](LICENSE)
