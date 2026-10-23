import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * SS-248: the canonical origin must follow NEXT_PUBLIC_SITE_URL →
 * https://<VERCEL_URL> → http://localhost:3002. The stale :3001 default
 * produced dead share links in dev (probe evidence 2026-10-24), and an
 * invalid value must fall through instead of breaking metadataBase.
 */

async function loadModule() {
  vi.resetModules();
  const mod = await import('./site-url');
  return { siteUrl: mod.siteUrl, absoluteUrl: mod.absoluteUrl };
}

describe('siteUrl fallback chain', () => {
  const env = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...env };
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
  });

  it('defaults to the browser-visible dev origin (:3002, never :3001)', async () => {
    const { siteUrl } = await loadModule();
    expect(siteUrl).toBe('http://localhost:3002');
  });

  it('prefers an explicit NEXT_PUBLIC_SITE_URL and strips trailing slashes', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://shop.example.com/';
    const { siteUrl } = await loadModule();
    expect(siteUrl).toBe('https://shop.example.com');
  });

  it('uses the Vercel deployment origin when no explicit URL is set', async () => {
    process.env.VERCEL_URL = 'sabz-storefront.vercel.app';
    const { siteUrl } = await loadModule();
    expect(siteUrl).toBe('https://sabz-storefront.vercel.app');
  });

  it('falls through invalid explicit values instead of throwing', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'not a url';
    const { siteUrl } = await loadModule();
    expect(siteUrl).toBe('http://localhost:3002');
  });

  it('rejects non-http(s) protocols', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'javascript:alert(1)';
    const { siteUrl } = await loadModule();
    expect(siteUrl).toBe('http://localhost:3002');
  });
});

describe('absoluteUrl', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
  });

  it('joins root-relative paths without double slashes', async () => {
    const { absoluteUrl } = await loadModule();
    expect(absoluteUrl('/products/x')).toBe('http://localhost:3002/products/x');
  });

  it('prepends a slash when missing', async () => {
    const { absoluteUrl } = await loadModule();
    expect(absoluteUrl('products/x')).toBe('http://localhost:3002/products/x');
  });
});
