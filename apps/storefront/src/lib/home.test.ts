import { describe, expect, it } from 'vitest';
import type {
  CatalogCategoryNode,
  CatalogProductCardDto,
} from '@sabz/types';
import { homeConfig } from '../config/home';
import {
  earliestFuturePromotion,
  isOfferEligible,
  limitHeroSlides,
  resolveAnnouncement,
  resolveFeaturedCategories,
  resolveHomeOffers,
  shouldShowSection,
  splitBlogTeaser,
} from './home';
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

  it('rejects placeholder routes even with query strings (SS-229: static pages are real now)', () => {
    for (const href of ['/cart', '/account']) {
      expect(isAdvertisableInternalHref(href)).toBe(false);
      expect(isAdvertisableInternalHref(`${href}?x=1`)).toBe(false);
    }
    // SS-229 made these real content pages — they must be advertisable.
    for (const href of ['/about', '/contact', '/terms']) {
      expect(isAdvertisableInternalHref(href)).toBe(true);
      expect(isAdvertisableInternalHref(`${href}`)).toBe(true);
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
        { label: 'حساب', href: '/account' },
        { label: 'مخرب', href: 'javascript:alert(1)' },
      ]),
    ).toEqual([]);
  });

  it('advertisable real content pages pass through (SS-229)', () => {
    expect(
      filterValidFooterLinks([
        { label: 'درباره ما', href: '/about' },
        { label: 'تماس', href: '/contact' },
        { label: 'قوانین', href: '/terms' },
      ]).map((link) => link.href),
    ).toEqual(['/about', '/contact', '/terms']);
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
    // Task 04 curation: six real majors, bounded rails, hero capped at three.
    expect(homeConfig.featuredCategorySlugs).toEqual([
      'mobile-accessories',
      'computer-accessories',
      'stock-goods',
      'smart-gadgets',
      'game-consoles',
      'audio-video',
    ]);
    expect(homeConfig.latestLimit).toBe(6);
    expect(homeConfig.inStockLimit).toBe(4);
    expect(homeConfig.maxCategoryTiles).toBe(6);
    expect(homeConfig.heroSlides.length).toBeLessThanOrEqual(3);
    expect(homeConfig.trustItems.length).toBeLessThanOrEqual(4);
    expect(
      homeConfig.trustItems.some((item) => item.title.includes('کمترین قیمت')),
    ).toBe(false);
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
      // Internal terms page or an absolute external seal URL — both real.
      expect(link.href === '/terms' || /^https:\/\//.test(link.href)).toBe(
        true,
      );
    }
    // Contact channels keep both display and machine-readable forms.
    for (const phone of contactChannels.phones) {
      expect(phone.tel).toMatch(/^\+98\d+$/);
    }
    expect(contactChannels.whatsapp.href).toMatch(/^https:\/\/wa\.me\//);
  });
});

function product(
  overrides: Partial<CatalogProductCardDto> = {},
): CatalogProductCardDto {
  return {
    id: 'product-1',
    name: 'کالای نمونه',
    slug: 'sample-product',
    condition: 'NEW',
    brand: null,
    category: { name: 'دسته', slug: 'category' },
    priceFrom: '1000000',
    compareAtPrice: null,
    callForPrice: false,
    promotionEndsAt: null,
    variantCount: 1,
    inStock: true,
    ratingAverage: null,
    ratingCount: 0,
    primaryImageUrl: null,
    primaryThumbnailUrl: null,
    ...overrides,
  };
}

describe('limitHeroSlides', () => {
  it('caps the campaign stage at three slides', () => {
    expect(limitHeroSlides([1, 2, 3, 4, 5])).toEqual([1, 2, 3]);
  });

  it('keeps shorter and empty lists untouched', () => {
    expect(limitHeroSlides([1, 2])).toEqual([1, 2]);
    expect(limitHeroSlides([])).toEqual([]);
  });
});

describe('isOfferEligible', () => {
  const now = Date.parse('2026-11-09T12:00:00.000Z');

  it('accepts an in-stock, genuinely discounted product', () => {
    expect(
      isOfferEligible(
        product({ priceFrom: '900000', compareAtPrice: '1000000' }),
        now,
      ),
    ).toBe(true);
  });

  it('never promotes an out-of-stock product', () => {
    expect(
      isOfferEligible(
        product({
          inStock: false,
          priceFrom: '900000',
          compareAtPrice: '1000000',
        }),
        now,
      ),
    ).toBe(false);
  });

  it('never turns a call-for-price row into a discount', () => {
    expect(
      isOfferEligible(
        product({
          callForPrice: true,
          priceFrom: '',
          compareAtPrice: '1000000',
        }),
        now,
      ),
    ).toBe(false);
  });

  it('rejects a non-discount compare-at pair', () => {
    expect(
      isOfferEligible(
        product({ priceFrom: '1000000', compareAtPrice: '900000' }),
        now,
      ),
    ).toBe(false);
  });

  it('accepts only a still-future promotion timestamp', () => {
    expect(
      isOfferEligible(
        product({ promotionEndsAt: '2026-11-10T12:00:00.000Z' }),
        now,
      ),
    ).toBe(true);
    expect(
      isOfferEligible(
        product({ promotionEndsAt: '2026-11-08T12:00:00.000Z' }),
        now,
      ),
    ).toBe(false);
  });

  it('rejects a product with no discount evidence at all', () => {
    expect(isOfferEligible(product(), now)).toBe(false);
  });
});

describe('earliestFuturePromotion', () => {
  const now = Date.parse('2026-11-09T12:00:00.000Z');

  it('ignores expired, invalid and missing timestamps', () => {
    expect(
      earliestFuturePromotion(
        [
          product(),
          product({ promotionEndsAt: '2026-11-01T00:00:00.000Z' }),
          product({ promotionEndsAt: 'not-a-date' }),
        ],
        now,
      ),
    ).toBeNull();
  });

  it('returns the earliest still-future timestamp', () => {
    expect(
      earliestFuturePromotion(
        [
          product({ promotionEndsAt: '2026-11-20T00:00:00.000Z' }),
          product({ promotionEndsAt: '2026-11-10T00:00:00.000Z' }),
        ],
        now,
      ),
    ).toBe('2026-11-10T00:00:00.000Z');
  });
});

describe('resolveHomeOffers', () => {
  const now = Date.parse('2026-11-09T12:00:00.000Z');

  it('uses eligible offers without a countdown unless a future end exists', () => {
    const discounted = product({
      id: 'discounted',
      priceFrom: '900000',
      compareAtPrice: '1000000',
    });
    const result = resolveHomeOffers(
      [discounted, product({ id: 'plain' })],
      [product({ id: 'fallback' })],
      6,
      now,
    );
    expect(result.mode).toBe('offer');
    expect(result.products.map((item) => item.id)).toEqual(['discounted']);
    expect(result.endsAt).toBeNull();
  });

  it('surfaces a real future promotion end for the countdown', () => {
    const result = resolveHomeOffers(
      [
        product({
          id: 'promo',
          promotionEndsAt: '2026-11-11T12:00:00.000Z',
        }),
      ],
      [],
      6,
      now,
    );
    expect(result.endsAt).toBe('2026-11-11T12:00:00.000Z');
  });

  it('falls back to in-stock featured products when no offer exists', () => {
    const result = resolveHomeOffers(
      [product({ id: 'plain' })],
      [
        product({ id: 'ready' }),
        product({ id: 'sold-out', inStock: false }),
      ],
      6,
      now,
    );
    expect(result.mode).toBe('featured');
    expect(result.products.map((item) => item.id)).toEqual(['ready']);
    expect(result.endsAt).toBeNull();
  });

  it('respects the configured limit', () => {
    const result = resolveHomeOffers(
      [
        product({ id: 'a', compareAtPrice: '2000000' }),
        product({ id: 'b', compareAtPrice: '2000000' }),
      ],
      [],
      1,
      now,
    );
    expect(result.products).toHaveLength(1);
  });
});

describe('splitBlogTeaser', () => {
  it('hides the teaser for an empty blog', () => {
    expect(splitBlogTeaser([])).toBeNull();
  });

  it('uses a single story as the feature with no companions', () => {
    expect(splitBlogTeaser(['a'])).toEqual({
      feature: 'a',
      secondary: [],
    });
  });

  it('keeps one feature and at most two companions', () => {
    expect(splitBlogTeaser(['a', 'b', 'c', 'd'])).toEqual({
      feature: 'a',
      secondary: ['b', 'c'],
    });
  });
});
