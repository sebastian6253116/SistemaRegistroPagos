/**
 * Prepare the disposable integration-test database.
 *
 *   npm run test:integration:prepare
 *
 * What it does, in order:
 *   1. Runs the SAFETY GUARD (see `test-database.ts`) BEFORE anything else.
 *      If the resolved database name does not contain "test", it refuses and
 *      exits 1 without creating a client or touching any database.
 *   2. Creates the test database if it does not exist.
 *   3. Applies all Prisma migrations to it.
 *   4. Loads the baseline seed (`prisma/seed.ts`).
 *
 * The database URL is derived from api/.env by swapping the database name to
 * `<name>_test`, so credentials are never hardcoded. If DATABASE_URL is already
 * exported in the environment it is used as-is and GUARDED (it must contain
 * "test").
 *
 * Prisma clients are only constructed/spawned AFTER the guard passes.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { API_ROOT, failLoudly, logResolvedTarget, resolveTestEnvironment } from './test-database';

function runStep(
  label: string,
  script: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  input?: string,
): void {
  console.log(`\n[test-db] ${label}`);
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: API_ROOT,
    env,
    stdio: input != null ? ['pipe', 'inherit', 'inherit'] : 'inherit',
    input,
  });
  if (result.status !== 0) {
    console.error(`[test-db] step failed: ${label} (exit ${result.status ?? 'null'})`);
    process.exit(result.status ?? 1);
  }
}

function main(): void {
  const info = resolveTestEnvironment();
  logResolvedTarget(info);

  const prismaCli = path.join(API_ROOT, 'node_modules', 'prisma', 'build', 'index.js');
  const tsxCli = path.join(API_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: info.testUrl,
    NODE_ENV: 'test',
  };

  // 2. Create the database if missing. `db execute` opens a direct connection
  //    (no prepared-statement DDL limits) against the server without a database.
  const safeName = info.testDbName.replace(/`/g, '``');
  runStep(
    `create database "${info.testDbName}" if missing`,
    prismaCli,
    ['db', 'execute', '--url', info.maintenanceUrl, '--stdin'],
    childEnv,
    `CREATE DATABASE IF NOT EXISTS \`${safeName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
  );

  // 3. Apply migrations.
  runStep(
    'apply migrations (prisma migrate deploy)',
    prismaCli,
    ['migrate', 'deploy', '--schema', path.join('prisma', 'schema.prisma')],
    childEnv,
  );

  // 4. Baseline seed (roles, permissions, catalogs, users).
  runStep('seed baseline fixtures (prisma/seed.ts)', tsxCli, [path.join('prisma', 'seed.ts')], childEnv);

  console.log(`\n[test-db] ready: ${info.testDbName}`);
}

try {
  main();
} catch (err) {
  failLoudly(err);
}
