import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['e2e/**', '**/node_modules/**', '**/.next/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      include: [
        'packages/auth/src/**/*.ts',
        'packages/nodes/src/**/*.ts',
        'packages/wg-easy-adapter/src/**/*.ts',
        'apps/panel/server/api/**/*.ts',
        'apps/subscription/server/**/*.ts',
        'apps/subscription/app/api/**/route.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/fixtures/**',
        '**/index.ts',
        'apps/panel/server/api/types.ts',
      ],
      reporter: ['text', 'text-summary'],
      reportsDirectory: path.join(os.tmpdir(), 'wg-easy-plane-coverage'),
      thresholds: {
        branches: 70,
        functions: 75,
        lines: 75,
        statements: 75,
      },
    },
  },
});
