## Why

Next.js 16 blocks development HMR requests when either application is opened through the IPv4 loopback address, leaving the rendered page disconnected from the development runtime. Local developers need both `localhost` and `127.0.0.1` entry points to work without weakening production origin handling.

## What Changes

- Allow the exact local development hosts `localhost` and `127.0.0.1` to access Next.js development resources in both applications.
- Keep the allowlist static, loopback-only, and limited to Next.js development resource handling.
- Add focused configuration verification so production builds and unrelated origins remain unaffected.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `system-verification-and-hardening`: Require panel and subscription development HMR to work from the supported loopback hostnames without admitting non-loopback origins.

## Impact

The panel and subscription Next.js configurations and their focused tests are affected. Public APIs, runtime environment variables, production origin checks, persistence, and dependencies are unchanged. No operational or personal data is introduced.
