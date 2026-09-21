import { defineConfig } from 'vitest/config';

/**
 * Default `npm test` runs ONLY the DB-free unit tests — it must never require a
 * database. The HTTP integration suite (tests/integration/*.int.test.ts) needs a
 * disposable test database and is launched by `npm run test:integration`, which
 * sets `VITEST_INTEGRATION=1` and `DATABASE_URL` (see tests/integration/run.ts).
 */
const integration = process.env.VITEST_INTEGRATION === '1';

export default defineConfig({
  test: {
    include: integration
      ? ['tests/integration/**/*.int.test.ts']
      : ['tests/**/*.test.ts'],
    exclude: integration
      ? ['**/node_modules/**']
      : ['tests/integration/**', '**/node_modules/**'],
    environment: 'node',
    globals: true,
    ...(integration
      ? {
          setupFiles: ['tests/integration/setup-guard.ts'],
          // Shared tables are truncated in `beforeEach`; parallel files would
          // corrupt each other's data, so run integration files sequentially.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        }
      : {}),
  },
});
