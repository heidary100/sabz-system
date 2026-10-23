/**
 * Canonical site origin for absolute customer-facing URLs (SS-248).
 *
 * Share links, canonical/OG URLs and JSON-LD ids must point at the origin the
 * visitor's browser actually uses. Fallback chain:
 *
 *   1. `NEXT_PUBLIC_SITE_URL` — explicit configuration, always wins.
 *   2. `https://<VERCEL_URL>` — deployment-provided origin.
 *   3. `http://localhost:3002` — dev storefront as seen from the browser.
 *      The container-internal port (:3001) must never leak into share URLs.
 *
 * Invalid configured values (bad protocol, garbage) fall through to the next
 * candidate instead of throwing later at `metadataBase: new URL(...)` time.
 */

const DEV_DEFAULT = 'http://localhost:3002';

function originCandidates(): string[] {
  return [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    DEV_DEFAULT,
  ].filter((value): value is string => typeof value === 'string');
}

function firstValidOrigin(): string {
  for (const raw of originCandidates()) {
    const value = raw.trim().replace(/\/+$/, '');
    try {
      const parsed = new URL(value);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return value;
      }
    } catch {
      // Invalid candidate — try the next one.
    }
  }
  return DEV_DEFAULT;
}

export const siteUrl = firstValidOrigin();

/** Root-relative path → absolute URL on the canonical origin. */
export function absoluteUrl(path: string): string {
  return `${siteUrl}${path.startsWith('/') ? path : `/${path}`}`;
}
