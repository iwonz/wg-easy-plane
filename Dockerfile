# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24.14.0

FROM node:${NODE_VERSION}-bookworm-slim AS build

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /workspace

RUN apt-get update \
    && apt-get install -y --no-install-recommends g++ make python3 \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

COPY . .

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm build

FROM node:${NODE_VERSION}-bookworm-slim AS panel

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/wg-easy-plane.sqlite \
    DATABASE_MIGRATIONS_PATH=/app/migrations

WORKDIR /app

RUN install -d -m 0700 -o node -g node /data

COPY --from=build --chown=node:node /workspace/apps/panel/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/panel/.next/static ./apps/panel/.next/static
COPY --from=build --chown=node:node /workspace/packages/database/migrations ./migrations

USER node

EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "apps/panel/server.js"]

FROM node:${NODE_VERSION}-bookworm-slim AS subscription

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3001

WORKDIR /app

COPY --from=build --chown=node:node /workspace/apps/subscription/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/subscription/.next/static ./apps/subscription/.next/static

USER node

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "apps/subscription/server.js"]
