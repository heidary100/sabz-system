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
 * Company facts (SS-224) — verified from the client's live website
 * (sabzsistem.com, contact-us page and product consult links, 2026-09-25).
 * Anti-fabrication rule unchanged: fields without a verified value stay
 * null/absent and consumers omit them.
 */
export const siteConfig: SiteConfig = {
  blurb:
    'سبز سیستم، فروشگاه اینترنتی کالای دیجیتال و لوازم جانبی در شمال کشور. «ارسال سریع»، «ضمانت بهترین قیمت» و «تضمین اصالت کالا» سه اصل اولیه سبز سیستم از نخستین روز تأسیس بوده است.',
  address: 'ساری – بلوار پاسداران – روبروی مرکز تخصصی پرتو مازند – بازرگانی سبز سیستم',
  phone: '۰۲۱-۹۱۳۰۱۹۰۰',
  hours: 'شنبه تا چهارشنبه ۹ تا ۱۸:۳۰ — پنجشنبه ۹ تا ۱۳:۳۰',
  email: 'info@sabzsistem.com',
  socials: [
    { label: 'اینستاگرام', href: 'https://www.instagram.com/sabzsistem' },
    { label: 'کانال تلگرام', href: 'https://t.me/SabzSisTeM' },
    { label: 'بله', href: 'https://web.bale.ai/@sabzsistem' },
  ],
  legalLinks: [
    { label: 'نماد اعتماد الکترونیکی', href: 'https://trustseal.enamad.ir/?id=147499&Code=L40xHynZjPMelCe7vsbe' },
    { label: 'تضمین قیمت در ترب', href: 'https://torob.com/shop/5732' },
  ],
};

/**
 * Verified contact channels shared by the footer, product consultation card
 * and (upcoming) contact page (SS-229). Phones keep display + tel: forms.
 */
export const contactChannels = {
  phones: [
    { display: '۰۲۱-۹۱۳۰۱۹۰۰', tel: '+982191301900' },
    { display: '۰۱۱-۳۳۳۴۱۶۸۴', tel: '+981133341684' },
  ],
  whatsapp: { display: '۰۹۳۶۱۶۶۲۶۴۶', href: 'https://wa.me/989361662646' },
  email: 'info@sabzsistem.com',
  /** Product-page consultation links (the live site's actual channels). */
  consult: [
    { label: 'ارتباط در تلگرام', href: 'https://t.me/+989361662646' },
    { label: 'ارتباط در بله', href: 'https://web.bale.ai/@sabzsistem' },
    { label: 'واتساپ', href: 'https://wa.me/989361662646' },
  ],
  postalCode: '4814938662',
} as const;

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
