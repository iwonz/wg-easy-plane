import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const runDirectory = process.env.WGEP_E2E_DIRECTORY;
if (!runDirectory) {
  throw new Error('WGEP_E2E_DIRECTORY must be created by the E2E runner');
}
process.env.APP_ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
process.env.DATABASE_PATH = path.join(runDirectory, 'system.sqlite');
process.env.PANEL_PUBLIC_URL = 'http://localhost:3000';
process.env.SUBSCRIPTION_PUBLIC_URL = 'http://localhost:3001';
process.env.CONTROL_PLANE_INTERNAL_URL = 'http://localhost:3000';
process.env.SYNC_INTERVAL_SECONDS = '0';
process.env.NODE_REQUEST_TIMEOUT_MS = '2000';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: [['line']],
  outputDir: path.join(runDirectory, 'playwright-output'),
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:3000',
    locale: 'en-US',
    acceptDownloads: false,
    screenshot: 'off',
    trace: 'off',
    video: 'off',
    serviceWorkers: 'block',
  },
  webServer: [
    {
      command: 'pnpm exec tsx e2e/mock-wg-easy.ts',
      url: 'http://127.0.0.1:39010/__health',
      timeout: 30_000,
      reuseExistingServer: false,
    },
    {
      command: 'pnpm --filter @wg-easy-plane/panel start',
      url: 'http://localhost:3000/healthz',
      timeout: 60_000,
      reuseExistingServer: false,
    },
    {
      command: 'pnpm --filter @wg-easy-plane/subscription start',
      url: 'http://localhost:3001/healthz',
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
});
