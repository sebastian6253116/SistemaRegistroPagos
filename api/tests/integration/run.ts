/**
 * Run the HTTP integration suite against the disposable test database.
 *
 *   npm run test:integration
 *
 * Requires the test database to be prepared first:
 *   npm run test:integration:prepare
 *
 * The SAFETY GUARD runs here BEFORE vitest is spawned; `DATABASE_URL` is then
 * injected into the child process so `src/config/env.ts` reads the test URL at
 * import time (dotenv never overrides an existing process.env value).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { API_ROOT, failLoudly, logResolvedTarget, resolveTestEnvironment } from './test-database';

/** Fails actionably when the test DB is not prepared (not an opaque Prisma error). */
async function assertPrepared(testUrl: string, testDbName: string): Promise<void> {
  const { PrismaClient } = await import('@prisma/client');
  const client = new PrismaClient({ datasources: { db: { url: testUrl } } });
  try {
    const rows = await client.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count FROM _prisma_migrations`;
    if (Number(rows[0]?.count ?? 0) === 0) throw new Error('no migrations applied');
  } catch {
    console.error(`\n[test-db] The test database "${testDbName}" is not prepared.`);
    console.error('[test-db] Run `npm run test:integration:prepare` first.\n');
    process.exit(1);
  } finally {
    await client.$disconnect();
  }
}

async function main(): Promise<void> {
  const info = resolveTestEnvironment();
  logResolvedTarget(info);
  await assertPrepared(info.testUrl, info.testDbName);

  const vitestCli = path.join(API_ROOT, 'node_modules', 'vitest', 'vitest.mjs');
  const result = spawnSync(process.execPath, [vitestCli, 'run'], {
    cwd: API_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: info.testUrl,
      NODE_ENV: 'test',
      VITEST_INTEGRATION: '1',
    },
  });

  process.exit(result.status ?? 1);
}

main().catch((err) => {
  failLoudly(err);
});
