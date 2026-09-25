import { describe, expect, it } from 'vitest';
import type { CatalogCategoryNode } from '@sabz/types';
import { homeConfig } from '../config/home';
import { resolveAnnouncement, resolveFeaturedCategories, shouldShowSection } from './home';
import {
  contactChannels,
  filterValidFooterLinks,
  isAdvertisableInternalHref,
  isSafeExternalUrl,
  siteConfig,
} from './site';

function node(
  slug: string,
  overrides: Partial<CatalogCategoryNode> = {},
  children: CatalogCategoryNode[] = [],
): CatalogCategoryNode {
  return {
    id: slug,
    name: slug,
    slug,
    sortOrder: 0,
    publishedProductCount: 1,
    children,
    ...overrides,
  };
}

/** Single artificial root with two browsable children (real catalog shape). */
function singleRootTree(): CatalogCategoryNode[] {
  return [
    node('digital', {}, [node('phone'), node('storage', {}, [node('ssd')])]),
  ];
}

describe('resolveFeaturedCategories', () => {
  it('respects explicit slug order, not tree order', () => {
    const tiles = resolveFeaturedCategories(singleRootTree(), ['storage', 'phone'], 8);
    expect(tiles.map((t) => t.slug)).toEqual(['storage', 'phone']);
  });

  it('resolves nested children, not just roots', () => {
    const tiles = resolveFeaturedCategories(singleRootTree(), ['ssd'], 8);
    expect(tiles.map((t) => t.slug)).toEqual(['ssd']);
  });

  it('skips missing slugs but keeps the rest in order', () => {
    const tiles = resolveFeaturedCategories(
      singleRootTree(),
      ['nope', 'phone', 'gone'],
      8,
    );
    expect(tiles.map((t) => t.slug)).toEqual(['phone']);
  });

  it('caps the result at the configured limit', () => {
    const tiles = resolveFeaturedCategories(singleRootTree(), ['phone', 'storage'], 1);
    expect(tiles.map((t) => t.slug)).toEqual(['phone']);
  });

  it('collapses duplicate slugs', () => {
    const tiles = resolveFeaturedCategories(singleRootTree(), ['phone', 'phone'], 8);
    expect(tiles.map((t) => t.slug)).toEqual(['phone']);
  });

  it('falls back to unwrapped roots when no slug is configured', () => {
    const tiles = resolveFeaturedCategories(singleRootTree(), [], 8);
    expect(tiles.map((t) => t.slug)).toEqual(['phone', 'storage']);
  });

  it('falls back to unwrapped roots when every slug is stale', () => {
    const tiles = resolveFeaturedCategories(singleRootTree(), ['nope', 'gone'], 8);
    expect(tiles.map((t) => t.slug)).toEqual(['phone', 'storage']);
  });

  it('applies the limit to the fallback as well', () => {
    const tiles = resolveFeaturedCategories(singleRootTree(), [], 1);
    expect(tiles).toHaveLength(1);
  });

  it('keeps multi-root trees untouched in fallback', () => {
    const tree = [node('b'), node('a')];
    const tiles = resolveFeaturedCategories(tree, [], 8);
    expect(tiles.map((t) => t.slug)).toEqual(['a', 'b']);
  });

  it('orders the fallback deterministically (sortOrder, then name)', () => {
    const tree = [
      node('b', { sortOrder: 1 }),
      node('a', { sortOrder: 1 }),
      node('c', { sortOrder: 0 }),
    ];
    const tiles = resolveFeaturedCategories(tree, [], 8);
    expect(tiles.map((t) => t.slug)).toEqual(['c', 'a', 'b']);
  });

  it('returns an empty array for an empty tree instead of crashing', () => {
    expect(resolveFeaturedCategories([], [], 8)).toEqual([]);
    expect(resolveFeaturedCategories([], ['phone'], 8)).toEqual([]);
  });

  it('returns an empty array for a zero limit', () => {
    expect(resolveFeaturedCategories(singleRootTree(), ['phone'], 0)).toEqual([]);
  });
});

describe('shouldShowSection', () => {
  it('hides empty rails', () => {
    expect(shouldShowSection([])).toBe(false);
  });

  it('shows non-empty rails', () => {
    expect(shouldShowSection([{ id: 'x' }])).toBe(true);
  });
});

describe('resolveAnnouncement', () => {
  it('resolves null to null', () => {
    expect(resolveAnnouncement(null)).toBeNull();
  });

  it('disables the bar for empty text', () => {
    expect(
      resolveAnnouncement({ text: '   ', dismissible: true }),
    ).toBeNull();
  });

  it('keeps a text-only announcement', () => {
    const config = { text: 'خبر مهم', dismissible: true };
    expect(resolveAnnouncement(config)).toEqual(config);
  });

  it('keeps a valid internal destination', () => {
    const config = { text: 'خبر مهم', href: '/products', dismissible: false };
    expect(resolveAnnouncement(config)).toEqual(config);
  });

  it('strips a placeholder destination but keeps the text', () => {
    expect(
      resolveAnnouncement({ text: 'خبر مهم', href: '/cart', dismissible: true }),
    ).toEqual({ text: 'خبر مهم', dismissible: true });
  });
});

describe('isSafeExternalUrl', () => {
  it('accepts https and http absolute URLs', () => {
    expect(isSafeExternalUrl('https://instagram.com/sabz')).toBe(true);
    expect(isSafeExternalUrl('http://example.com/x')).toBe(true);
  });

  it('rejects javascript, data, and relative URLs', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('data:text/html,hi')).toBe(false);
    expect(isSafeExternalUrl('/products')).toBe(false);
    expect(isSafeExternalUrl('not a url')).toBe(false);
    expect(isSafeExternalUrl('')).toBe(false);
  });
});

describe('isAdvertisableInternalHref', () => {
  it('allows real customer routes', () => {
    expect(isAdvertisableInternalHref('/products')).toBe(true);
    expect(isAdvertisableInternalHref('/categories')).toBe(true);
    expect(isAdvertisableInternalHref('/products?sort=newest')).toBe(true);
  });

  it('rejects placeholder routes even with query strings', () => {
    for (const href of ['/cart', '/account', '/about', '/contact', '/terms']) {
      expect(isAdvertisableInternalHref(href)).toBe(false);
      expect(isAdvertisableInternalHref(`${href}?x=1`)).toBe(false);
    }
  });

  it('rejects external and protocol-relative hrefs', () => {
    expect(isAdvertisableInternalHref('https://example.com')).toBe(false);
    expect(isAdvertisableInternalHref('//example.com')).toBe(false);
  });
});

describe('filterValidFooterLinks', () => {
  it('keeps valid internal links', () => {
    expect(
      filterValidFooterLinks([{ label: 'همه محصولات', href: '/products' }]),
    ).toEqual([{ label: 'همه محصولات', href: '/products', external: false }]);
  });

  it('keeps valid external social links and marks them external', () => {
    expect(
      filterValidFooterLinks([
        { label: 'اینستاگرام', href: 'https://instagram.com/sabz' },
      ]),
    ).toEqual([
      {
        label: 'اینستاگرام',
        href: 'https://instagram.com/sabz',
        external: true,
      },
    ]);
  });

  it('drops missing hrefs, empty labels, and hash stubs', () => {
    expect(
      filterValidFooterLinks([
        { label: 'بدون آدرس', href: '' },
        { label: '', href: '/products' },
        { label: '   ', href: '/products' },
        { label: 'ساختگی', href: '#' },
      ]),
    ).toEqual([]);
  });

  it('drops placeholder and unsafe destinations instead of stubbing them', () => {
    expect(
      filterValidFooterLinks([
        { label: 'سبد خرید', href: '/cart' },
        { label: 'درباره ما', href: '/about' },
        { label: 'تماس', href: '/contact' },
        { label: 'قوانین', href: '/terms' },
        { label: 'حساب', href: '/account' },
        { label: 'مخرب', href: 'javascript:alert(1)' },
      ]),
    ).toEqual([]);
  });

  it('never emits a hash or empty href', () => {
    const links = filterValidFooterLinks([
      { label: 'a', href: '#' },
      { label: 'b', href: '' },
      { label: 'c', href: '/products' },
    ]);
    expect(links.every((link) => link.href && link.href !== '#')).toBe(true);
  });
});

describe('safe defaults', () => {
  it('ships only verified facts: trust claims present, unverified windows absent (SS-224)', () => {
    // Trust claims + hero slides come from the client's own live-site copy.
    expect(homeConfig.trustItems.length).toBeGreaterThan(0);
    expect(homeConfig.heroSlides.length).toBeGreaterThan(0);
    expect(homeConfig.brandTabs.length).toBeGreaterThan(0);
    expect(homeConfig.categoryBanners.length).toBeGreaterThan(0);
    // Unverified values stay absent — anti-fabrication rule.
    expect(homeConfig.announcement).toBeNull();
    expect(homeConfig.saleBanner).toBeNull();
    expect(homeConfig.appLinks).toEqual([]);
    // Curated slugs empty = deterministic fallback; rails stay bounded.
    expect(homeConfig.featuredCategorySlugs).toEqual([]);
    expect(homeConfig.latestLimit).toBe(8);
    expect(homeConfig.inStockLimit).toBe(8);
    expect(homeConfig.maxCategoryTiles).toBeGreaterThan(0);
  });

  it('ships the verified company facts (SS-224): contact, socials, seals', () => {
    expect(siteConfig.blurb).toBeTruthy();
    expect(siteConfig.address).toBeTruthy();
    expect(siteConfig.phone).toBeTruthy();
    expect(siteConfig.hours).toBeTruthy();
    expect(siteConfig.email).toBeTruthy();
    // Every advertised external link must be a real absolute URL.
    for (const social of siteConfig.socials) {
      expect(social.href).toMatch(/^https:\/\//);
    }
    for (const link of siteConfig.legalLinks) {
      expect(link.href).toMatch(/^https:\/\//);
    }
    // Contact channels keep both display and machine-readable forms.
    for (const phone of contactChannels.phones) {
      expect(phone.tel).toMatch(/^\+98\d+$/);
    }
    expect(contactChannels.whatsapp.href).toMatch(/^https:\/\/wa\.me\//);
  });
});
