## Why

The shared production Content Security Policy is also applied unchanged during `next dev`, where React requires `unsafe-eval` for its development runtime. Both applications therefore render server HTML but cannot hydrate, leaving client-driven screens stuck in their initial loading state.

## What Changes

- Generate the common browser security headers with an explicit development mode.
- Permit `unsafe-eval` only in development so React can hydrate and Next.js debugging remains functional.
- Keep the production CSP unchanged and verify both policy variants with focused tests.
- Apply the same environment-aware policy to the panel and subscription applications.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `system-verification-and-hardening`: Require browser hardening to remain production-strict while allowing the minimum development-only CSP relaxation needed for application hydration.

## Impact

The shared security-header configuration, both Next.js application configurations, and focused security-header tests are affected. Public APIs, persisted data, dependencies, and production security behavior do not change. The change uses only synthetic local browser verification and has no privacy or upstream wg-easy compatibility impact.
