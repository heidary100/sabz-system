/**
 * Pre-setup isolation guard for the SS-284B PostgreSQL integration suite.
 *
 * This module must not import PrismaClient or any DB-capable module. It is
 * called before the test-database global setup so missing or ambiguous
 * configuration fails before a database can be created or migrated.
 *
 * Required environment:
 *   DEMO_SEED_INTEGRATION=1
 *   TEST_DATABASE_URL=postgresql://user:password@host:port/database_test
 *   DEMO_SEED_EXPECTED_TEST_HOST
 *   DEMO_SEED_EXPECTED_TEST_PORT
 *   DEMO_SEED_EXPECTED_TEST_DATABASE
 *   DEMO_SEED_EXPECTED_TEST_USER
 *
 * Credentials are never included in diagnostics.
 */
const DEFAULT_POSTGRES_PORT = '5432';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Refusing to run demo-seed integration tests without explicit ${name}.`,
    );
  }
  return value;
}

function normalizeHost(value: string): string {
  const lower = value.trim().toLowerCase();
  return lower.startsWith('[') && lower.endsWith(']')
    ? lower.slice(1, -1)
    : lower;
}

function requireExpectedPort(): string {
  const raw = requiredEnv('DEMO_SEED_EXPECTED_TEST_PORT');
  if (!/^\d{1,5}$/.test(raw)) {
    throw new Error(
      'DEMO_SEED_EXPECTED_TEST_PORT must be an integer between 1 and 65535.',
    );
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      'DEMO_SEED_EXPECTED_TEST_PORT must be an integer between 1 and 65535.',
    );
  }
  return String(port);
}

function decodeUrlComponent(
  value: string,
  component: 'database name' | 'username',
): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(
      `Refusing to run demo-seed integration tests: TEST_DATABASE_URL has a malformed encoded ${component}.`,
    );
  }
}

export function resolveDemoSeedTestUrl(): string {
  if (process.env.DEMO_SEED_INTEGRATION !== '1') {
    throw new Error(
      'Refusing to run demo-seed integration tests without DEMO_SEED_INTEGRATION=1.',
    );
  }
  const url = process.env.TEST_DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'Refusing to run demo-seed integration tests without an explicit TEST_DATABASE_URL.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('TEST_DATABASE_URL is not a valid PostgreSQL URL.');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(
      'TEST_DATABASE_URL must use the postgres:// or postgresql:// protocol.',
    );
  }

  const rawSegments = parsed.pathname.split('/').filter((part) => part.length > 0);
  if (rawSegments.length !== 1) {
    throw new Error(
      'TEST_DATABASE_URL must contain exactly one database path segment.',
    );
  }
  const name = decodeUrlComponent(rawSegments[0]!, 'database name');
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run demo-seed integration tests against "${name}"; the database must end with _test.`,
    );
  }

  const expectedHost = requiredEnv('DEMO_SEED_EXPECTED_TEST_HOST');
  const expectedName = requiredEnv('DEMO_SEED_EXPECTED_TEST_DATABASE');
  const expectedPort = requireExpectedPort();
  const expectedUser = requiredEnv('DEMO_SEED_EXPECTED_TEST_USER');

  if (normalizeHost(parsed.hostname) !== normalizeHost(expectedHost)) {
    throw new Error(
      `Refusing to run demo-seed integration tests: expected host "${expectedHost}", got "${parsed.hostname}".`,
    );
  }

  const actualPort = parsed.port === '' ? DEFAULT_POSTGRES_PORT : parsed.port;
  if (!/^\d{1,5}$/.test(actualPort)) {
    throw new Error(
      'TEST_DATABASE_URL contains an invalid PostgreSQL port.',
    );
  }
  const normalizedActualPort = String(Number(actualPort));
  if (normalizedActualPort !== expectedPort) {
    throw new Error(
      `Refusing to run demo-seed integration tests: expected port "${expectedPort}", got "${normalizedActualPort}".`,
    );
  }

  if (name !== expectedName) {
    throw new Error(
      `Refusing to run demo-seed integration tests: expected database "${expectedName}", got "${name}".`,
    );
  }

  const username = decodeUrlComponent(parsed.username, 'username');
  if (!username) {
    throw new Error(
      'TEST_DATABASE_URL must include a non-empty PostgreSQL username.',
    );
  }
  if (username !== expectedUser) {
    throw new Error(
      `Refusing to run demo-seed integration tests: expected username "${expectedUser}", got "${username}".`,
    );
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run demo-seed integration tests in production.');
  }
  return url;
}
