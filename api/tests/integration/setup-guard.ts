/**
 * Vitest setup file (integration mode only).
 *
 * Defense in depth: even if someone bypasses `tests/integration/run.ts` (for
 * example `VITEST_INTEGRATION=1 npx vitest run`), this runs BEFORE any test
 * module is imported and therefore BEFORE `src/config/env.ts` reads
 * `process.env` and before any Prisma client is constructed. If the resolved
 * database is not a test database, the suite aborts before touching anything.
 */
import { assertTestDatabase } from './test-database';

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    '[SAFETY GUARD] DATABASE_URL is not set for the integration run. ' +
      'Use `npm run test:integration` (it derives a *_test database) instead of ' +
      'invoking vitest directly.',
  );
}

const testDbName = assertTestDatabase(url);
// eslint-disable-next-line no-console
console.log(`[test-db] integration suite target: ${testDbName}`);
