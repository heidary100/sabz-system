import { resolveDemoSeedTestUrl } from './demo-seed-isolation';

const ENV_KEYS = [
  'DEMO_SEED_INTEGRATION',
  'TEST_DATABASE_URL',
  'DEMO_SEED_EXPECTED_TEST_HOST',
  'DEMO_SEED_EXPECTED_TEST_PORT',
  'DEMO_SEED_EXPECTED_TEST_DATABASE',
  'DEMO_SEED_EXPECTED_TEST_USER',
  'NODE_ENV',
] as const;

const BASE_URL =
  'postgresql://demo%40user:not-a-real-password@db.example:5433/sabz_case_test';

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
});

function configure(
  overrides: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {},
): void {
  const values: Record<string, string | undefined> = {
    DEMO_SEED_INTEGRATION: '1',
    TEST_DATABASE_URL: BASE_URL,
    DEMO_SEED_EXPECTED_TEST_HOST: 'db.example',
    DEMO_SEED_EXPECTED_TEST_PORT: '5433',
    DEMO_SEED_EXPECTED_TEST_DATABASE: 'sabz_case_test',
    DEMO_SEED_EXPECTED_TEST_USER: 'demo@user',
    NODE_ENV: 'test',
    ...overrides,
  };
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('demo-seed integration target isolation', () => {
  it('accepts an exact host/port/database/username match and decodes username', () => {
    configure();
    expect(resolveDemoSeedTestUrl()).toBe(BASE_URL);
  });

  it('normalizes an omitted port to the PostgreSQL default', () => {
    configure({
      TEST_DATABASE_URL:
        'postgresql://demo%40user:secret@db.example/sabz_case_test',
      DEMO_SEED_EXPECTED_TEST_PORT: '5432',
    });
    expect(resolveDemoSeedTestUrl()).toContain('db.example/sabz_case_test');
  });

  it('rejects a wrong hostname without exposing credentials', () => {
    configure({ DEMO_SEED_EXPECTED_TEST_HOST: 'other.example' });
    let message = '';
    try {
      resolveDemoSeedTestUrl();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/expected host/);
    expect(message).not.toContain('secret');
    expect(message).not.toContain('not-a-real-password');
  });

  it('rejects a wrong port', () => {
    configure({ DEMO_SEED_EXPECTED_TEST_PORT: '5432' });
    expect(() => resolveDemoSeedTestUrl()).toThrow(/expected port/);
  });

  it('rejects a wrong database', () => {
    configure({ DEMO_SEED_EXPECTED_TEST_DATABASE: 'other_case_test' });
    expect(() => resolveDemoSeedTestUrl()).toThrow(/expected database/);
  });

  it('rejects a wrong username', () => {
    configure({ DEMO_SEED_EXPECTED_TEST_USER: 'someone-else' });
    expect(() => resolveDemoSeedTestUrl()).toThrow(/expected username/);
  });

  it.each([
    'DEMO_SEED_EXPECTED_TEST_HOST',
    'DEMO_SEED_EXPECTED_TEST_PORT',
    'DEMO_SEED_EXPECTED_TEST_DATABASE',
    'DEMO_SEED_EXPECTED_TEST_USER',
  ] as const)('rejects a missing %s', (key) => {
    configure({ [key]: undefined });
    expect(() => resolveDemoSeedTestUrl()).toThrow(new RegExp(key));
  });

  it('rejects a malformed URL', () => {
    configure({ TEST_DATABASE_URL: 'this is not a url' });
    expect(() => resolveDemoSeedTestUrl()).toThrow(/not a valid PostgreSQL URL/);
  });

  it.each(['abc', '0', '65536'])(
    'rejects invalid expected port %s',
    (port) => {
      configure({ DEMO_SEED_EXPECTED_TEST_PORT: port });
      expect(() => resolveDemoSeedTestUrl()).toThrow(
        /DEMO_SEED_EXPECTED_TEST_PORT must be an integer/,
      );
    },
  );

  it('rejects a URL-encoded username that decodes to a different value', () => {
    configure({ DEMO_SEED_EXPECTED_TEST_USER: 'demo-user' });
    expect(() => resolveDemoSeedTestUrl()).toThrow(/expected username/);
  });

  it('rejects missing integration opt-in', () => {
    configure({ DEMO_SEED_INTEGRATION: undefined });
    expect(() => resolveDemoSeedTestUrl()).toThrow(/DEMO_SEED_INTEGRATION=1/);
  });

  it.each(['sabz_case', 'sabz_case_test_extra'])(
    'rejects database %s without the required _test suffix',
    (database) => {
      configure({
        TEST_DATABASE_URL: `postgresql://demo%40user:secret@db.example:5433/${database}`,
        DEMO_SEED_EXPECTED_TEST_DATABASE: database,
      });
      expect(() => resolveDemoSeedTestUrl()).toThrow(
        /database must end with _test/,
      );
    },
  );

  it('rejects a non-PostgreSQL protocol', () => {
    configure({
      TEST_DATABASE_URL: 'https://demo%40user:secret@db.example:5433/sabz_case_test',
    });
    expect(() => resolveDemoSeedTestUrl()).toThrow(/postgres:\/\//);
  });

  it('rejects production execution', () => {
    configure({ NODE_ENV: 'production' });
    expect(() => resolveDemoSeedTestUrl()).toThrow(/production/);
  });
});
