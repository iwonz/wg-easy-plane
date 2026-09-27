# Container deployment

WG Easy Plane publishes two independent rootless images:

- `ghcr.io/iwonz/wg-easy-plane-panel`
- `ghcr.io/iwonz/wg-easy-plane-subscription`

Use an exact SemVer tag in production. `latest` is convenient for evaluation but is not an immutable deployment reference.

## Prepare secrets and storage

Generate the required encryption key on the deployment host and keep it in a secret manager or an ignored local environment file:

```sh
openssl rand -base64 32
```

Never commit that value, node credentials, `.env` files, databases, backups, logs, WireGuard/AmneziaWG configurations, QR output, browser recordings, or real node addresses. The key must remain stable for the lifetime of the database: losing or changing it makes encrypted node credentials and subscription tokens unreadable.

The panel image stores its database and pre-migration backups under `/data`. Mount a named volume or an operator-owned directory there. The image runs as UID/GID `1000`; host bind mounts must be writable only by that identity and should not be located inside the checkout.

## Run the panel directly

```sh
docker volume create wg-easy-plane-data
docker run -d \
  --name wg-easy-plane-panel \
  --restart unless-stopped \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  -p 3000:3000 \
  -v wg-easy-plane-data:/data \
  -e APP_ENCRYPTION_KEY="$APP_ENCRYPTION_KEY" \
  -e PANEL_PUBLIC_URL="https://panel.example.invalid" \
  -e SUBSCRIPTION_PUBLIC_URL="https://access.example.invalid" \
  ghcr.io/iwonz/wg-easy-plane-panel:0.1.0
```

`PANEL_PUBLIC_URL` must be the exact browser origin used for CSRF checks. The default database path is `/data/wg-easy-plane.sqlite`. The panel applies bundled migrations before it accepts traffic and creates a sibling backup only when an existing database needs migration.

The subscription application has no database and talks to the panel only from its server-side BFF:

```sh
docker run -d \
  --name wg-easy-plane-subscription \
  --restart unless-stopped \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  -p 3001:3001 \
  -e CONTROL_PLANE_INTERNAL_URL="https://panel.example.invalid" \
  ghcr.io/iwonz/wg-easy-plane-subscription:0.1.0
```

## Run with Compose

Export `APP_ENCRYPTION_KEY`, set public origins when they differ from localhost, then start the panel only:

```sh
docker compose up -d panel
```

Start both applications by enabling the optional profile:

```sh
docker compose --profile subscription up -d
```

To run only the subscription application against an existing panel:

```bash
CONTROL_PLANE_INTERNAL_URL=https://panel.example.com \
  docker compose --profile subscription up -d --no-deps subscription
```

Combined Compose deployment uses the private `http://panel:3000` service origin from `.env.example` for BFF traffic and keeps panel state in the `panel-data` volume. Override `WGEP_VERSION` with an exact release, and override `PANEL_PORT` or `SUBSCRIPTION_PORT` only when different host bindings are required.

## Upgrades and recovery

1. Back up the external volume and encryption key using your normal encrypted backup system.
2. Read the release notes and select an exact newer SemVer image tag.
3. Pull and recreate the containers. Do not run two panel replicas against the same SQLite file.
4. Wait for `/healthz` before admitting traffic and retain the pre-migration sibling backup until the upgrade is accepted.

If startup migration fails, stop the panel, preserve the failed database and logs privately, and restore the volume from the operator backup or the sibling pre-migration copy. Never attach a production database or raw logs to a public issue.

## Reverse proxy privacy

Terminate TLS at a trusted proxy, pass the original scheme/host correctly, and disable logging of `Authorization`, `Cookie`, and `Set-Cookie` headers. Subscription credentials live in the URL fragment and should never reach HTTP access logs; still disable full-URL analytics, browser-session recording, and response-body capture on both applications. Do not cache `/api`, subscription pages, configurations, or QR responses. Preserve the applications' `private, no-store` headers and set request body limits appropriate for the small JSON API.
