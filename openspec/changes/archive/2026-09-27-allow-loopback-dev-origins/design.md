## Context

Both Next.js applications currently rely on the framework default for development-resource origin checks. Next.js 16 rejects HMR access when a developer opens the application at `127.0.0.1`, even though it is a local loopback endpoint. The panel and subscription configurations are independent and must remain behaviorally aligned. See `proposal.md` for motivation and the system verification delta for the observable contract.

## Goals / Non-Goals

**Goals:**

- Make HMR work through both common loopback hostnames in both applications.
- Keep the trust expansion exact, reviewable, and development-only.
- Lock the configuration with a focused automated assertion.

**Non-Goals:**

- Allow LAN addresses, wildcard domains, reverse-proxy hostnames, or arbitrary configurable origins.
- Change application-level CSRF/origin validation, production headers, or environment loading.
- Read or modify developer environment files.

## Decisions

### Use a shared explicit host list in both Next.js configurations

Each `NextConfig` will set `allowedDevOrigins` to the same literal values: `localhost` and `127.0.0.1`. This directly uses the framework boundary that emitted the warning and prevents a fix in one application from leaving the other inconsistent.

An environment-driven allowlist was rejected because it would add configuration surface, invite accidental wildcard or operational-host exposure, and is unnecessary for the reported local workflow. A wildcard loopback pattern was rejected in favor of exact values.

### Verify configuration without starting a developer server

A focused unit test will import both Next.js configurations and assert the exact allowlist. Existing E2E and production-build verification will continue to validate that the configurations remain loadable. Starting two long-running dev servers in the test suite was rejected because the relevant framework behavior is already owned by Next.js and the project needs to lock only its configuration contract.

### Keep secret-bearing configuration out of the data flow

The change consumes no runtime environment values and introduces no logging. Tests inspect only static public configuration values, so no credentials, node addresses, database paths, or local environment contents enter fixtures or artifacts.

## Risks / Trade-offs

- [A future Next.js release changes `allowedDevOrigins` semantics] → Type checking, production builds, and the exact-value test fail visibly during upgrades.
- [A developer needs a custom local hostname] → It remains blocked by default; a separately reviewed change can add a justified exact host later.
- [Duplicated literals drift between applications] → One test asserts both configurations against the same expected list.

## Migration Plan

No data or environment migration is required. Deploy by updating both application configurations and restarting the development servers. Roll back by reverting the configuration entries; production artifacts and persisted data are unaffected.
