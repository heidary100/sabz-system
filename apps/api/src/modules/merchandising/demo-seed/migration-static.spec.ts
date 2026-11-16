import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Static migration guard. This test never connects to a database; it checks
 * the unapplied guard migration's ordering/atomicity and required schema
 * elements so the isolated migration test can later verify deployment.
 */
describe('homepage demo seed guard migration static guards', () => {
  const sql = readFileSync(
    join(
      __dirname,
      '../../../../prisma/migrations/20261115190000_homepage_demo_seed_guardrails/migration.sql',
    ),
    'utf8',
  );

  it('is explicitly transactional and runs compatibility preflights before DDL', () => {
    const begin = sql.indexOf('BEGIN;');
    const firstPreflight = sql.indexOf('DO $$');
    const firstDdl = Math.min(
      sql.indexOf('CREATE TABLE'),
      sql.indexOf('ALTER TABLE'),
    );
    const commit = sql.indexOf('COMMIT;');
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(firstPreflight).toBeGreaterThan(begin);
    expect(firstDdl).toBeGreaterThan(firstPreflight);
    expect(commit).toBeGreaterThan(firstDdl);
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true);
  });

  it('contains fencing, baseline, publication-link and media provenance schema', () => {
    expect(sql).toContain('"fencingGeneration"');
    expect(sql).toContain('"baselineHash"');
    expect(sql).toContain('"demoSeedOperationId"');
    expect(sql).toContain('"sourceSha256"');
    expect(sql).toContain('"processedSha256"');
    expect(sql).toContain('"thumbnailSha256"');
    expect(sql).toContain('HomepageDemoSeedOperation_publicationId_fkey');
    expect(sql).toContain(
      'HomepageDemoSeedOperation_state_startedAt_idx',
    );
  });

  it('does not delete or rewrite existing records', () => {
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bUPDATE\s+"(?:MerchCampaign|MerchMedia)"/i);
    expect(sql).toContain('RAISE EXCEPTION');
  });
});
