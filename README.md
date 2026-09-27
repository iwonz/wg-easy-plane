<p align="center">
  <img src="docs/assets/logo.png" alt="WG Easy Plane logo" width="128" />
</p>

# WG Easy Plane

WG Easy Plane is an open-source control plane for managing WireGuard and AmneziaWG clients across multiple [wg-easy](https://github.com/wg-easy/wg-easy) `15.4.0` nodes. It provides an administrator panel and an optional read-only subscription application for delivering live configurations and QR codes.

![WG Easy Plane control plane](docs/assets/readme-hero.png)

## Docker

Generate the encryption key once and keep it unchanged for the lifetime of the database:

```bash
export APP_ENCRYPTION_KEY="$(openssl rand -base64 32)"
```

Run the panel:

```bash
docker volume create wg-easy-plane-data
docker run -d \
  --name wg-easy-plane-panel \
  --restart unless-stopped \
  -p 3000:3000 \
  -e APP_ENCRYPTION_KEY \
  -e PANEL_PUBLIC_URL=http://localhost:3000 \
  -e SUBSCRIPTION_PUBLIC_URL=http://localhost:3001 \
  -v wg-easy-plane-data:/data \
  ghcr.io/iwonz/wg-easy-plane-panel:latest
```

Run only the subscription application against an already reachable panel:

```bash
docker run -d \
  --name wg-easy-plane-subscription \
  --restart unless-stopped \
  -p 3001:3001 \
  -e CONTROL_PLANE_INTERNAL_URL=https://panel.example.com \
  ghcr.io/iwonz/wg-easy-plane-subscription:latest
```

Open the panel at [http://localhost:3000](http://localhost:3000). The subscription application is available at [http://localhost:3001](http://localhost:3001) when started.

## Docker Compose

Copy `.env.example` to the ignored `.env` file and replace `APP_ENCRYPTION_KEY` with the output of `openssl rand -base64 32`.

Panel only:

```bash
docker compose up -d panel
```

Subscription application only, against an already reachable panel:

```bash
CONTROL_PLANE_INTERNAL_URL=https://panel.example.com \
  docker compose --profile subscription up -d --no-deps subscription
```

Panel and subscription application:

```bash
docker compose --profile subscription up -d
```

Set `WGEP_VERSION` in `.env` to a released version such as `1.0.0` to pin both images instead of using `latest`. The combined deployment uses the private `http://panel:3000` service address from `.env.example`.

## Development

Requirements: Node.js 24 and pnpm 10.

Create `apps/panel/.env`:

```dotenv
APP_ENCRYPTION_KEY=<base64-encoded-32-byte-key>
PANEL_PUBLIC_URL=http://localhost:3000
SUBSCRIPTION_PUBLIC_URL=http://localhost:3001
SYNC_INTERVAL_SECONDS=0
```

Create `apps/subscription/.env`:

```dotenv
CONTROL_PLANE_INTERNAL_URL=http://localhost:3000
```

Then start both applications:

```bash
corepack enable
pnpm install
pnpm dev
```

SQLite uses the system user-data directory outside the repository unless `DATABASE_PATH` is set to another absolute path.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) before starting. Every change uses a dedicated branch and OpenSpec change, Conventional Commits, tests, and `pnpm verify` before a fast-forward merge into `master`.
