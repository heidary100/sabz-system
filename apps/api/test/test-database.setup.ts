import { execFileSync } from 'child_process';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

/**
 * Jest globalSetup: test-database isolation (test_db).
 *
 * Every integration/e2e spec runs against a DEDICATED test database, never
 * the development database the portal reads. Resolution order:
 *   1. `TEST_DATABASE_URL` when set (CI, managed Postgres).
 *   2. Otherwise derived from `DATABASE_URL` by suffixing the database name
 *      with `_test` (dev `sabz` -> `sabz_test`), preserving host/credentials
 *      so container (`postgres`) and host-native (`localhost`) layouts both
 *      work with zero configuration.
 *
 * Hard rule: the resolved database name must end with `_test`. Anything else
 * fails fast instead of risking the dev catalog.
 *
 * The setup creates the database when missing, applies all committed
 * migrations (`migrate deploy`, idempotent), then points the worker
 * processes at it by overwriting `process.env.DATABASE_URL`. Spec files
 * need no changes. The database is kept afterwards for fast reruns and
 * failure inspection — it is disposable test space by contract.
 */

const DB_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function databaseNameOf(url: string): string {
  return new URL(url).pathname.replace(/^\//, '').split('/')[0] ?? '';
}

function withDatabaseName(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

function assertTestDatabase(url: string, origin: string): void {
  let name = '';
  try {
    name = databaseNameOf(url);
  } catch {
    throw new Error(
      `[test-db] ${origin} is not a valid Postgres URL.`,
    );
  }
  if (!DB_NAME_PATTERN.test(name) || !name.endsWith('_test')) {
    throw new Error(
      `[test-db] Refusing to run tests against database "${name || '<empty>'}". ` +
        `Test databases must end with "_test" (${origin}). ` +
        `Set TEST_DATABASE_URL explicitly or point DATABASE_URL at the dev database.`,
    );
  }
}

function resolveTestDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL?.trim();
  if (explicit) {
    assertTestDatabase(explicit, 'TEST_DATABASE_URL');
    return explicit;
  }
  const devUrl = process.env.DATABASE_URL?.trim();
  if (!devUrl) {
    throw new Error(
      '[test-db] Set DATABASE_URL (dev connection, test name is derived) or ' +
        'TEST_DATABASE_URL (used as-is).',
    );
  }
  const devName = databaseNameOf(devUrl);
  const testName = devName.endsWith('_test') ? devName : `${devName}_test`;
  const derived = withDatabaseName(devUrl, testName);
  assertTestDatabase(derived, 'derived TEST_DATABASE_URL');
  return derived;
}

function redact(url: string): string {
  return url.replace(/:\/\/[^@]+@/, '://***@');
}

export default async function testDatabaseSetup(): Promise<void> {
  const testUrl = resolveTestDatabaseUrl();
  const testName = databaseNameOf(testUrl);

  // CREATE DATABASE cannot run inside a transaction and cannot take a bound
  // parameter; the name is pattern-validated above, so interpolation is safe.
  const admin = new PrismaClient({
    datasourceUrl: withDatabaseName(testUrl, 'postgres'),
  });
  try {
    await admin.$connect();
    const existing = await admin.$queryRaw<Array<{ exists: number }>>`
      SELECT 1 AS "exists" FROM pg_database WHERE datname = ${testName}
    `;
    if (existing.length === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${testName}"`);
    }
  } finally {
    await admin.$disconnect();
  }

  const apiDir = join(__dirname, '..');
  try {
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: apiDir,
      env: { ...process.env, DATABASE_URL: testUrl },
      stdio: 'pipe',
    });
  } catch (error) {
    throw new Error(
      `[test-db] migrate deploy failed for ${redact(testUrl)}. ` +
        'Is pnpm installed and the Postgres host reachable?',
      { cause: error },
    );
  }

  process.env.DATABASE_URL = testUrl;
  process.env.TEST_DATABASE_URL = testUrl;
  console.log(`[test-db] integration/e2e suites using ${redact(testUrl)}`);
}
