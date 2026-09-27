## Context

The applications currently receive one locale and one message dictionary from their server layouts, while the shared locale action persists a cookie and reloads the document. The panel uses standard Mantine tabs, per-view headings, text buttons for many row actions, and repeated modal declarations. Branding is represented by raster assets in the panel public directory and README documentation. See `proposal.md` for motivation and the delta specifications for observable requirements.

## Goals / Non-Goals

**Goals:**

- Make locale changes stateful within the current React tree so no route navigation or document reload is required.
- Reuse presentation primitives for segmented navigation, bold modal headings, and accessible icon actions.
- Keep panel and documentation artwork visually coordinated and free of runtime data.
- Preserve keyboard navigation, accessible names, MobX state, and existing API behavior.

**Non-Goals:**

- Changing locale routing, supported locales, theme persistence, API contracts, database schema, or authentication behavior.
- Redesigning forms, table contents, node/client domain workflows, or the subscription information architecture.
- Adding uploaded avatars, configurable branding, or additional languages.

## Decisions

### Keep both dictionaries in an application-scoped locale provider

Each application's client provider will receive the server-selected initial locale plus its English and Russian dictionaries. A shared context will own the active locale and remount the existing `NextIntlClientProvider` with the matching dictionary. The compact locale action will update that context and the locale cookie in the same event. This preserves the current URL and mounted application state while allowing all `useTranslations` consumers to update immediately.

The alternative of `router.refresh()` was rejected because it still performs server navigation and can discard transient modal or form state. A global mutable locale singleton was rejected because it would violate request isolation.

### Style semantic tabs as one connected segmented control

The main panel remains a semantic tab interface, but a reusable style configuration removes the underline and joins adjacent controls inside one rounded boundary. This retains keyboard and accessibility behavior without duplicating panel state in a separate segmented-control component. Duplicate view headings are removed while top-level create actions remain visible.

### Configure modal title emphasis once

The shared Mantine theme will set the modal title font weight, applying the rule consistently to panel and subscription dialogs. This avoids drift between many modal call sites. Existing accessible dialog names continue to come from their localized titles.

### Convert row operations to labelled icon actions

Node and client table/card actions will use `ActionIcon` controls and localized `Tooltip` labels. Each control will also carry an explicit accessible label; disabled and loading behavior remains equivalent to the previous text button. Destructive actions keep their existing confirmation flows and color semantics.

### Generate two separate coordinated bitmap assets

The logo mark and README illustration will be generated independently from one visual direction: a central control plane coordinating secure network nodes. The logo remains text-free because the product name is rendered as HTML in the header. The illustration contains no legible endpoints, identifiers, configuration data, QR patterns, or third-party marks. Generated assets replace the existing tracked PNG files only after visual inspection.

## Risks / Trade-offs

- [Bundling both locale dictionaries increases client JavaScript slightly] → The applications have only two small built-in dictionaries; keep the locale map scoped to each application and avoid additional runtime fetches.
- [Provider remounting can reset descendants if keyed incorrectly] → Change only the `NextIntlClientProvider` locale/messages props without keying or replacing the surrounding MobX store provider.
- [Icon-only actions can be ambiguous] → Use familiar icons, localized tooltips, and explicit accessible labels for every action.
- [Generated artwork can be visually inconsistent or include pseudo-text] → Request text-free assets, inspect both outputs, and reject/regenerate any asset containing illegible lettering or sensitive-looking payloads.
- [Global modal styling could affect third-party content] → Limit the theme override to title font weight and retain all existing modal structure and sizing.

## Migration Plan

No data or API migration is required. Deploy the updated static assets and application bundles together. Rollback is a normal application rollback because persisted locale cookies, database content, and public contracts remain compatible.
