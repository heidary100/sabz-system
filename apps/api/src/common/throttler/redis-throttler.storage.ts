import { Injectable, Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from '../redis/redis.service';

/**
 * Redis-backed throttler storage (SS-244B, master plan §6 Stage 3).
 *
 * The default in-memory storage diverges per instance, so rate limits are
 * wrong the moment a second API replica serves traffic. This storage keeps
 * the same contract (ttl/blockDuration in, seconds-scale expiries out) with
 * one atomic Lua script per hit: INCR the counter, PEXPIRE the window, and
 * SET the block flag once the limit is exceeded.
 *
 * Failure behavior is fail-open by design (availability over strictness —
 * rate limiting is a protective control, not an auth boundary; the OTP
 * service keeps its own stricter Redis limits underneath). A Redis outage
 * must never take the API down, so every hit races a short timeout and
 * degrades to an allow-record with a warning log, mirroring the
 * best-effort StorefrontCacheService precedent.
 */
const KEY_PREFIX = 'throttle:';

/** Upper bound for one storage hit before degrading to fail-open allow. */
const STORAGE_TIMEOUT_MS = 500;

const INCREMENT_SCRIPT = `
local blocked = redis.call('EXISTS', KEYS[2])
if blocked == 1 then
  local current = tonumber(redis.call('GET', KEYS[1]) or '0')
  return {current, redis.call('PTTL', KEYS[1]), 1, redis.call('PTTL', KEYS[2])}
end
local total = redis.call('INCR', KEYS[1])
if total == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
if total > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return {total, redis.call('PTTL', KEYS[1]), 1, tonumber(ARGV[3])}
end
return {total, redis.call('PTTL', KEYS[1]), 0, 0}
`;

function toSeconds(ceilMs: number): number {
  return Math.max(0, Math.ceil(ceilMs / 1000));
}

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const counterKey = `${KEY_PREFIX}${key}:${throttlerName}`;
    const blockKey = `${counterKey}:blocked`;
    try {
      const result = (await this.withTimeout(
        this.redis.eval(
          INCREMENT_SCRIPT,
          2,
          counterKey,
          blockKey,
          String(ttl),
          String(limit),
          String(blockDuration),
        ),
      )) as [number, number, number, number];
      const [totalHits = 0, ttlMs = 0, blocked = 0, blockMs = 0] =
        result.map(Number);
      return {
        totalHits,
        timeToExpire: toSeconds(ttlMs),
        isBlocked: blocked === 1,
        timeToBlockExpire: toSeconds(blockMs),
      };
    } catch (error) {
      this.logger.warn(
        `Throttler Redis hit failed (fail-open allow): ${error instanceof Error ? error.message : String(error)}`,
      );
      return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`timed out after ${STORAGE_TIMEOUT_MS}ms`)),
            STORAGE_TIMEOUT_MS,
          );
          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}
