## 1. Development origin configuration

- [x] 1.1 Add the exact `localhost` and `127.0.0.1` development-origin allowlist to both Next.js applications and verify with `pnpm typecheck`.
- [x] 1.2 Add a focused test that asserts both applications expose only the approved loopback hosts and verify with `pnpm exec vitest run apps/panel/tests/next-config.test.ts`.

## 2. Verification and delivery

- [x] 2.1 Verify the complete repository with `openspec validate allow-loopback-dev-origins --strict` and `pnpm verify`.
- [x] 2.2 Confirm the staged diff contains no environment files, credentials, operational endpoints, generated runtime artifacts, or unrelated changes with `git diff --cached --check`, gitleaks, and the privacy audit.
