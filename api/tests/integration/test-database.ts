/**
 * Test-database resolution + the integration-test SAFETY GUARD.
 *
 * Integration tests build, mutate and truncate real rows. They must NEVER run
 * against the development database (`gestion_cobros`) or any other real
 * database, so every entry point funnels through `resolveTestEnvironment()`,
 * which refuses to run unless the resolved database name ends with "_test".
 *
 * The guard is intentionally the FIRST thing executed: it does not import
 * `src/config/env.ts`, does not construct a Prisma client and does not open a
 * connection. If it fails, nothing has been touched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseDotenv } from 'dotenv';

export const API_ROOT = process.cwd();
export const TEST_DB_SUFFIX = '_test';
export const MAINTENANCE_DB_PATH = '/';

/** Extracts the database name from a mysql:// connection URL. */
export function databaseNameFromUrl(url: string): string {
  const parsed = new URL(url);
  const name = decodeURIComponent(parsed.pathname.replace(/^\/+/, '')).split('/')[0];
  return name ?? '';
}

/** Returns a copy of `url` pointing at `name` (empty string => no database). */
export function urlWithDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = name ? `/${name}` : MAINTENANCE_DB_PATH;
  return parsed.toString();
}

export function isTestDatabaseName(name: string): boolean {
  return name.toLowerCase().endsWith(TEST_DB_SUFFIX);
}

/** Thrown when the resolved database is not a disposable test database. */
export class SafetyGuardError extends Error {
  readonly databaseName: string;

  constructor(databaseName: string) {
    super(
      `[SAFETY GUARD] Refusing to run integration tests against database ` +
        `"${databaseName || '(empty)'}". The database name MUST end with "_test" ` +
        `(for example "gestion_cobros_test"). Integration tests create, mutate ` +
        `and truncate data and must NEVER touch a development or production ` +
        `database. Point DATABASE_URL at a test database, or leave it unset so ` +
        `the bootstrap derives "<dbname>_test" from api/.env.`,
    );
    this.name = 'SafetyGuardError';
    this.databaseName = databaseName;
  }
}

/** Hard guard: returns the database name or throws a loud `SafetyGuardError`. */
export function assertTestDatabase(url: string): string {
  let name = '';
  try {
    name = databaseNameFromUrl(url);
  } catch {
    throw new SafetyGuardError('(unparseable DATABASE_URL)');
  }
  if (!name || !isTestDatabaseName(name)) throw new SafetyGuardError(name);
  return name;
}

/** Parses api/.env WITHOUT mutating process.env (no side effects). */
export function readDotenv(apiRoot: string = API_ROOT): Record<string, string> {
  const file = path.join(apiRoot, '.env');
  if (!fs.existsSync(file)) return {};
  return parseDotenv(fs.readFileSync(file));
}

export interface ResolvedTestEnvironment {
  /** Final URL used by the app/Prisma inside the integration run. */
  testUrl: string;
  /** Final database name (always ends with "_test"). */
  testDbName: string;
  /** URL with the database segment removed, used only to CREATE the database. */
  maintenanceUrl: string;
  /** Where the final URL came from. */
  source: 'environment' | 'dotenv';
  /** The configured base URL (before derivation). */
  sourceUrl: string;
}

/**
 * Resolves the database the integration suite will use.
 *
 * - If `DATABASE_URL` is present in the ENVIRONMENT (shell/CI), it is treated as
 *   the final target and only GUARDED, never rewritten. This is what makes
 *   `DATABASE_URL=<dev db> npm run test:integration:prepare` refuse loudly.
 * - Otherwise the URL is read from `api/.env` and the database name is swapped
 *   to `<name>_test` (idempotent when the name already ends with "_test"), so the
 *   base credentials are reused instead of hardcoded.
 */
export function resolveTestEnvironment(
  explicitUrl: string | undefined = process.env.DATABASE_URL,
  apiRoot: string = API_ROOT,
): ResolvedTestEnvironment {
  if (explicitUrl) {
    const testDbName = assertTestDatabase(explicitUrl);
    return {
      testUrl: explicitUrl,
      testDbName,
      maintenanceUrl: urlWithDatabase(explicitUrl, ''),
      source: 'environment',
      sourceUrl: explicitUrl,
    };
  }

  const dotenvVars = readDotenv(apiRoot);
  const base = dotenvVars.DATABASE_URL;
  if (!base) {
    throw new Error(
      'DATABASE_URL is not set in the environment nor present in api/.env. ' +
        'Cannot derive the test database.',
    );
  }

  const baseName = databaseNameFromUrl(base);
  const testUrl = isTestDatabaseName(baseName)
    ? base
    : urlWithDatabase(base, `${baseName}${TEST_DB_SUFFIX}`);
  const testDbName = assertTestDatabase(testUrl);

  return {
    testUrl,
    testDbName,
    maintenanceUrl: urlWithDatabase(testUrl, ''),
    source: 'dotenv',
    sourceUrl: base,
  };
}

/** Prints the guard banner used by the CLI entry points. */
export function logResolvedTarget(info: ResolvedTestEnvironment): void {
  // Never print credentials: only the database name and its origin.
  console.log('[test-db] source           :', info.source);
  console.log('[test-db] target database  :', info.testDbName);
}

/** Prints a loud, unmissable guard failure and exits 1. */
export function failLoudly(err: unknown): never {
  if (err instanceof SafetyGuardError) {
    console.error('');
    console.error('============================================================');
    console.error(err.message);
    console.error('============================================================');
    console.error('');
    process.exit(1);
  }
  throw err;
}
