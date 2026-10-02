import Redis from 'ioredis';

/**
 * Jest setup (e2e only): throttler-counter isolation between suite files.
 *
 * SS-244B moved throttling to a shared Redis storage so limits hold across
 * API replicas. The e2e suites previously got per-suite-fresh counters for
 * free (one in-memory map per booted app); with shared keys, hits from an
 * earlier suite file would leak into later files (same tracker IP, TTL
 * windows) and exact-count assertions would flake. Flushing the throttle
 * namespace before each file restores the old per-suite baseline, mirroring
 * how the test database is already isolated per run. Best-effort: a Redis
 * outage must fail the flush, never the suite (storage itself is fail-open).
 */

const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  lazyConnect: true,
});

beforeAll(async () => {
  try {
    await redis.ping();
    const keys = await redis.keys('throttle:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Fail-open, like the storage: isolation loss must not fail suites.
  }
});

afterAll(async () => {
  redis.disconnect();
});
