import {
  applyGuardBlockers,
  assertDevelopmentEnvironment,
  buildPublicMediaUrl,
  computeDatabaseFingerprint,
  normalizeDatabaseIdentity,
  validatePublicApiBaseUrl,
} from './identity';
import { HISTORICAL_IDENTITY, options } from './test-fixtures';

describe('homepage demo seed identity', () => {
  it('computes the historical fingerprint deterministically', () => {
    expect(
      computeDatabaseFingerprint({
        systemIdentifier: '7689483372718039078',
        databaseName: 'sabz',
        databaseOid: 16384,
      }),
    ).toBe(HISTORICAL_IDENTITY.fingerprint);
    expect(
      computeDatabaseFingerprint({
        systemIdentifier: '7689483372718039078',
        databaseName: 'sabz',
        databaseOid: 16384,
      }),
    ).toBe(HISTORICAL_IDENTITY.fingerprint);
  });

  it('normalizes raw identity values', () => {
    expect(
      normalizeDatabaseIdentity({
        systemIdentifier: '7689483372718039078',
        databaseName: 'sabz',
        databaseOid: '16384',
        postgresVersion: '16.15',
      }),
    ).toEqual(HISTORICAL_IDENTITY);
  });

  it('refuses non-development environments', () => {
    expect(() => assertDevelopmentEnvironment('development')).not.toThrow();
    expect(() => assertDevelopmentEnvironment('production')).toThrow(
      /NODE_ENV=development/,
    );
    expect(() => assertDevelopmentEnvironment('test')).toThrow(
      /NODE_ENV=development/,
    );
    expect(() => assertDevelopmentEnvironment(undefined)).toThrow(
      /NODE_ENV=development/,
    );
  });

  it('requires confirmation and the exact expected fingerprint', () => {
    const blockers = applyGuardBlockers(
      options({
        confirm: false,
        expectedFingerprint: null,
        publish: true,
        publishConfirm: false,
      }),
      HISTORICAL_IDENTITY,
    );
    expect(blockers.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining([
        'CONFIRMATION_MISSING',
        'EXPECTED_FINGERPRINT_MISSING',
        'PUBLISH_CONFIRMATION_MISSING',
      ]),
    );

    const mismatch = applyGuardBlockers(
      options({ expectedFingerprint: '0'.repeat(64) }),
      HISTORICAL_IDENTITY,
    );
    expect(mismatch.map((blocker) => blocker.code)).toContain(
      'FINGERPRINT_MISMATCH',
    );
  });

  it('validates browser-facing public API bases', () => {
    expect(validatePublicApiBaseUrl('https://shop.example.com/api/v1')).toEqual({
      valid: true,
      reason: null,
    });
    for (const value of [
      null,
      'api:3000/api/v1',
      'http://localhost:3000/api/v1',
      'http://127.0.0.1:3000/api/v1',
      'http://api:3000/api/v1',
      'http://192.168.1.10:3000/api/v1',
      'http://[::1]:3000/api/v1',
      'http://[::ffff:127.0.0.1]/api/v1',
      'http://[fc00::1]/api/v1',
      'http://0.0.0.0/api/v1',
      'http://100.64.0.1/api/v1',
      'http://localhost./api/v1',
      'https://user:pass@shop.example.com/api/v1',
    ]) {
      expect(validatePublicApiBaseUrl(value).valid).toBe(false);
    }
  });

  it('builds public merchandising media URLs', () => {
    expect(
      buildPublicMediaUrl('https://shop.example.com/api/v1/', 'media-1'),
    ).toBe(
      'https://shop.example.com/api/v1/catalog/merch-media/media-1',
    );
  });
});
