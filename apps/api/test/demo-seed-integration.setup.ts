import { resolveDemoSeedTestUrl } from './demo-seed-isolation';

/**
 * Dedicated demo-seed integration global setup.
 *
 * The isolation guard runs before the test-database setup module is even
 * imported, so missing or ambiguous configuration fails before any
 * DB-capable module is loaded or can create, migrate or connect to a database.
 * Use only through jest-demo-seed-integration.json.
 */
export default async function demoSeedIntegrationSetup(): Promise<void> {
  const testUrl = resolveDemoSeedTestUrl();
  // test-database.setup re-validates the _test name and uses this explicit URL.
  process.env.TEST_DATABASE_URL = testUrl;
  const { default: testDatabaseSetup } = await import('./test-database.setup');
  await testDatabaseSetup();
}
