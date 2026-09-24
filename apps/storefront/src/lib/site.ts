/**
 * Site/company configuration (SS-215 foundation).
 *
 * Central place for real company-provided facts consumed by the footer (and
 * later the contact/about surfaces). The company name itself lives in
 * `@/lib/brand` (SS-209) and is not duplicated here.
 *
 * Anti-fabrication rule: every fact field is nullable and defaults to absent.
 * Missing data must NEVER be filled with `"..."`, `"#"`, or plausible-looking
 * placeholders — consumers omit absent fields instead of rendering stubs.
 */

export interface SocialLink {
  /** Persian platform label, e.g. `اینستاگرام`. Never empty. */
  label: string;
  /** Absolute external URL supplied by the company. Never empty. */
  href: string;
}

export interface SiteLink {
  /** Persian link label. Never empty. */
  label: string;
  /** Internal route (`/terms`) or absolute external URL. Never empty. */
  href: string;
}

export interface SiteConfig {
  /** Short brand blurb for the footer; null hides it. */
  blurb: string | null;
  /** Physical address as supplied; null hides the contact row. */
  address: string | null;
  /** Public support/sales phone as supplied; null hides the contact row. */
  phone: string | null;
  /** Working hours as supplied; null hides the contact row. */
  hours: string | null;
  /** Public contact email as supplied; null hides the contact row. */
  email: string | null;
  /** Only platforms the company actually owns; [] hides the social group. */
  socials: SocialLink[];
  /** Only pages that actually exist with real content; [] hides the group. */
  legalLinks: SiteLink[];
}

/**
 * Empty-safe defaults: no company facts are known to the repository yet.
 * The footer renders brand + navigation only until facts are supplied.
 */
export const siteConfig: SiteConfig = {
  blurb: null,
  address: null,
  phone: null,
  hours: null,
  email: null,
  socials: [],
  legalLinks: [],
};

export interface FooterLink {
  label: string;
  href: string;
  external: boolean;
}

/**
 * Routes that exist in the app router but are placeholders without real
 * customer functionality (later milestones own them). They must resolve by
 * URL but must NOT be advertised in the footer — advertising them would be
 * fake navigation.
 */
const PLACEHOLDER_ROUTES = new Set([
  '/cart',
  '/account',
  '/about',
  '/contact',
  '/terms',
]);

/** Minimal external-URL safety: absolute URL with an expected protocol only. */
export function isSafeExternalUrl(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Whether an internal href may be advertised in customer-facing navigation:
 * a root-relative path that is not a known placeholder route.
 */
export function isAdvertisableInternalHref(href: string): boolean {
  if (!href.startsWith('/') || href.startsWith('//')) {
    return false;
  }
  const path = href.split(/[?#]/)[0]!;
  return !PLACEHOLDER_ROUTES.has(path);
}

/**
 * Filters raw configured links down to renderable footer links. Drops:
 * empty labels, missing/empty hrefs, `#` fragments, `undefined`-producing
 * values, placeholder internal routes, unsafe external URLs, and relative
 * paths that are neither internal routes nor absolute URLs. Never generates
 * a `#` or `undefined` href — invalid entries disappear, they are not stubbed.
 */
export function filterValidFooterLinks(
  links: ReadonlyArray<{ label: string; href: string }>,
): FooterLink[] {
  const valid: FooterLink[] = [];
  for (const link of links) {
    const label = link.label.trim();
    const href = link.href.trim();
    if (!label || !href || href === '#') {
      continue;
    }
    if (href.startsWith('/')) {
      if (!isAdvertisableInternalHref(href)) {
        continue;
      }
      valid.push({ label, href, external: false });
      continue;
    }
    if (isSafeExternalUrl(href)) {
      valid.push({ label, href, external: true });
    }
  }
  return valid;
}
