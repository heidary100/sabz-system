import { Injectable } from '@nestjs/common';

export const PUBLIC_HOMEPAGE_CACHE_TTL_MS = 10_000;
const MAX_ENTRIES = 24;

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

/**
 * Minimal in-process cache for resolved public homepages (Task 05.5).
 *
 * The key includes publication id/version/schemaVersion, so a newly published
 * homepage never reuses the previous version's entry. Live price/stock data is
 * intentionally at most `ttlMs` stale. This is not a distributed cache; the
 * HTTP `max-age` bound is deliberately aligned with the same TTL.
 */
@Injectable()
export class PublicHomepageCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly ttlMs = PUBLIC_HOMEPAGE_CACHE_TTL_MS;

  get<T>(key: string, now = Date.now()): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, now = Date.now()): void {
    this.entries.set(key, { expiresAt: now + this.ttlMs, value });
    this.prune(now);
  }

  clear(): void {
    this.entries.clear();
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}
