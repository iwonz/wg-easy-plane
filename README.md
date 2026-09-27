# WG Easy Plane

WG Easy Plane is an open-source control plane for managing clients across multiple [wg-easy](https://github.com/wg-easy/wg-easy) WireGuard and AmneziaWG nodes.

The project is being built spec-first. Runtime code will be introduced through the ordered [OpenSpec roadmap](docs/roadmap.md); completed behavior contracts live under `openspec/specs`.

## Development policy

- Read [AGENTS.md](AGENTS.md) before agent-led work.
- Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change.
- Report vulnerabilities using [SECURITY.md](SECURITY.md), never a public issue.
- Do not use real node addresses, credentials, clients, VPN configurations, or QR payloads in tests or examples.

## Status

The repository is under initial development. No production release is available yet.

## License

[MIT](LICENSE)
