import { describe, expect, it } from 'vitest';
import type { CatalogCategoryNode } from '@sabz/types';
import { homeConfig } from '../config/home';
import { resolveFeaturedCategories } from './home';
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

describe('footer chrome config', () => {
  it('keeps only footer category chrome; homepage merchandising is API-owned', () => {
    expect(homeConfig.featuredCategorySlugs).toEqual([
      'mobile-accessories',
      'computer-accessories',
      'stock-goods',
      'smart-gadgets',
      'game-consoles',
      'audio-video',
    ]);
    expect(homeConfig.maxCategoryTiles).toBe(6);
    expect(Object.keys(homeConfig).sort()).toEqual([
      'featuredCategorySlugs',
      'maxCategoryTiles',
    ]);
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
