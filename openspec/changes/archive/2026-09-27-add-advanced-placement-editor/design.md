## Context

The managed lifecycle already stores either a shared desired seed or a complete `WgEasyClientUpdateRequest` per placement. The adapter validates upstream snapshots and has a strict update schema. Inspection of the wg-easy `v15.4.0` tag shows that the mutable client contract contains addresses, routes, firewall addresses, DNS, MTU, hooks, persistent keepalive, server endpoint, and the legacy Amnezia fields `jC`, `jMin`, `jMax`, and `i1` through `i5`. The additional AWG 3.0/3.1 fields documented on the moving `edge` branch are not present in the pinned release's database schema or `ClientUpdateSchema`.

## Goals / Non-Goals

**Goals:**

- Expose every non-shared mutable field accepted by the pinned update endpoint and no unsupported fields.
- Preserve shared, unedited, nullable, empty, and Amnezia-specific values across an advanced update and later retries.
- Enforce WireGuard versus AmneziaWG mode before contacting upstream.
- Keep API responses, UI state, logs, SQLite, and tests free of key material, credentials, configurations, and QR payloads.

**Non-Goals:**

- Supporting fields introduced after wg-easy 15.4.0, including the newer AWG 3.0/3.1 timing, padding, cookie, or handshake controls.
- Editing remote identifiers, public/private or preshared keys, user attribution, interface settings, or traffic telemetry.
- Bulk advanced updates, adoption, or drift resolution.

## Decisions

### Exact pinned advanced contract

Define a shared `PlacementAdvancedValues` schema containing only `ipv4Address`, `ipv6Address`, hooks, `allowedIps`, `serverAllowedIps`, `firewallIps`, `mtu`, `persistentKeepalive`, `serverEndpoint`, `dns`, `jC`, `jMin`, `jMax`, and `i1` through `i5`. Keep managed `name`, `enabled`, and `expiresAt` authoritative on the parent and merge them into the complete adapter payload server-side. Strict schemas reject unknown keys, including newer edge-only AWG fields.

### Read-through hydration

An advanced read returns the durable complete desired payload when available. For a shared-only seed, synchronize that node and hydrate from the validated safe snapshot. If a known remote client is confirmed absent, mark the placement missing and return a safe conflict instead of constructing defaults that might erase state.

### Complete update with durable intent

PATCH accepts a complete advanced form. The service merges it with the parent's shared fields, validates the exact adapter schema, persists the complete desired payload before network I/O, records one update attempt, and updates only the selected placement's status. A failed attempt retains the complete intent for retry; successful synchronization may refresh it from the validated remote state.

### Mode enforcement

The placement's stored node mode is authoritative. WireGuard accepts only null Amnezia fields and rejects any non-null AWG value before an upstream request. AmneziaWG accepts the legacy v15.4.0 fields within adapter bounds and preserves them in complete desired state. Responses include the node mode and report `legacy` AWG support only for AmneziaWG.

### Safe localized form

The panel uses text areas for ordered list and hook values, number inputs with contract bounds, explicit inheritance controls for nullable lists, and an Amnezia section only for AmneziaWG placements. The notice names the pinned compatibility level and explains that newer AWG controls require a future wg-easy upgrade. Immutable and sensitive fields never appear in form state.

## Risks / Trade-offs

- [Desired state can become stale after out-of-band mutation] → Preserve it deliberately and leave comparison and resolution to the following drift change.
- [Full update payloads are verbose] → Prefer lossless deterministic retries over sparse patches that depend on undocumented upstream merge behavior.
- [The roadmap names newer AWG controls] → Do not fabricate support against 15.4.0; make the version boundary visible and cover strict rejection in tests.
- [Hydration requires a network request] → Reuse the existing sanitized sync boundary and fail safely when the remote state cannot be validated.

## Migration Plan

1. Deploy contracts and routes without a schema migration.
2. Existing shared-only desired seeds hydrate lazily on the first advanced read or update.
3. Rollback leaves complete desired JSON readable by the previous lifecycle service, which already understands the same adapter payload.
