import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');

describe('storefront service worker cache policy', () => {
  it('uses a versioned shell cache so deploys purge stale build chunks', () => {
    expect(source).toContain("const CACHE = 'sabz-storefront-shell-v2'");
    expect(source).toContain('keys.filter((key) => key !== CACHE)');
  });

  it('never serves /_next/static cache-first (stale JS after deploy)', () => {
    const staticBranch = source.slice(
      source.indexOf("url.pathname.startsWith('/_next/static/')"),
      source.indexOf('self.addEventListener(\'push\'', source.indexOf("url.pathname.startsWith('/_next/static/')")),
    );
    expect(staticBranch).toContain('fetch(request)');
    expect(staticBranch.indexOf('fetch(request)')).toBeLessThan(
      staticBranch.indexOf('caches.match(request)'),
    );
  });
});
