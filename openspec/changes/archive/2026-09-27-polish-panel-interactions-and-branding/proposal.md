## Why

The current panel shell mixes underline-style navigation, duplicated section headings, text-heavy row actions, and branding that does not clearly communicate the product. Locale switching also reloads the whole page, interrupting in-progress UI state for a preference change that can be applied locally.

## What Changes

- Replace underline navigation with compact connected segmented tabs and remove redundant Nodes and Clients headings from their tab panels.
- Apply locale changes immediately in both applications without navigation or a document reload while continuing to persist the locale cookie.
- Show a redesigned project mark plus `WG Easy Plane` in the panel header, and replace the README hero with a coordinated control-plane illustration.
- Simplify the profile menu by removing its divider and adding meaningful leading icons to Tokens and Logout.
- Present node and client row actions as accessible icon actions with localized labels and tooltips.
- Make modal titles consistently bold across panel and subscription interfaces and shorten the Russian add-node title to `Добавление ноды`.
- Preserve all existing API, authentication, node, client, theme, and privacy behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `application-shell`: instant client-side locale switching, connected segmented navigation, coordinated project branding, profile-menu presentation, and consistent modal-title styling.
- `node-management`: compact accessible icon actions, removal of the redundant tab-panel heading, and revised add-node copy.
- `client-inventory-sync`: compact accessible icon actions and removal of the redundant Clients tab-panel heading for discovered inventory.
- `managed-client-lifecycle`: compact accessible icon actions and removal of the redundant Clients tab-panel heading for managed clients.

## Impact

The change affects the shared UI locale provider and shell controls, panel and subscription application providers, the panel header and primary navigation, node and client management views, localized message files, UI tests and their Next.js standalone launcher, public logo assets, and the README hero. It does not change public API schemas, database data, environment configuration, or dependencies that handle credentials and VPN artifacts.
