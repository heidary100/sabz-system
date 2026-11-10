import {
  PUBLIC_HOMEPAGE_CACHE_TTL_MS,
  PublicHomepageCache,
} from './public-homepage.cache';

describe('PublicHomepageCache', () => {
  it('returns values within the TTL and expires them afterwards', () => {
    const cache = new PublicHomepageCache();
    cache.set('v1', { version: 1 }, 1_000);
    expect(cache.get('v1', 1_000 + PUBLIC_HOMEPAGE_CACHE_TTL_MS - 1)).toEqual({
      version: 1,
    });
    expect(cache.get('v1', 1_000 + PUBLIC_HOMEPAGE_CACHE_TTL_MS)).toBeNull();
  });

  it('keeps publication versions in separate cache identities', () => {
    const cache = new PublicHomepageCache();
    cache.set('pub-a:v1:s1', { version: 1 });
    cache.set('pub-b:v2:s1', { version: 2 });
    expect(cache.get<{ version: number }>('pub-a:v1:s1')?.version).toBe(1);
    expect(cache.get<{ version: number }>('pub-b:v2:s1')?.version).toBe(2);
  });

  it('supports explicit clearing for tests and cache resets', () => {
    const cache = new PublicHomepageCache();
    cache.set('v1', true);
    cache.clear();
    expect(cache.get('v1')).toBeNull();
  });
});
