## 1. Environment-aware security policy

- [x] 1.1 Add an explicit development option to the shared browser security-header factory, preserve a strict default, and cover both policy variants; verify with `pnpm exec vitest run packages/config/src/security-headers.test.ts`
- [x] 1.2 Pass the runtime mode from both Next.js application configurations and verify compilation with `pnpm typecheck`

## 2. Integrated verification

- [x] 2.1 Verify panel and subscription client hydration against synthetic local configuration with Playwright CLI, confirming the panel advances from its loader and production CSP remains free of `unsafe-eval`
- [x] 2.2 Run `openspec validate fix-development-csp --strict`, formatting, lint, unit tests, privacy audit, production build, and gitleaks before review
