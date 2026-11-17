import type {
  CatalogProductCardDto,
  PublishedHomepageDto,
  PublishedProductRailSection,
} from '@sabz/types';
import {
  generatePublicHomepageEtag,
  ifNoneMatchMatches,
} from './public-homepage-etag';

function card(overrides: Partial<CatalogProductCardDto> = {}): CatalogProductCardDto {
  return {
    id: 'product-1',
    name: 'محصول',
    slug: 'product-1',
    condition: 'NEW',
    brand: { name: 'برند', slug: 'brand' },
    category: { name: 'دسته', slug: 'category' },
    priceFrom: '100000',
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

function payload(
  productOverrides: Partial<CatalogProductCardDto> = {},
  version = 1,
): PublishedHomepageDto {
  const section: PublishedProductRailSection = {
    key: 'rail',
    type: 'PRODUCT_RAIL',
    order: 0,
    title: 'ریل',
    subtitle: null,
    actionHref: null,
    products: [card(productOverrides)],
  };
  return {
    version,
    schemaVersion: 1,
    publishedAt: '2026-11-09T00:00:00.000Z',
    sections: [section],
  };
}

describe('public homepage ETag generation', () => {
  it('is deterministic for identical resolved representations', () => {
    expect(generatePublicHomepageEtag(payload())).toBe(
      generatePublicHomepageEtag(payload()),
    );
  });

  it('changes when a live product price changes', () => {
    expect(generatePublicHomepageEtag(payload({ priceFrom: '120000' }))).not.toBe(
      generatePublicHomepageEtag(payload({ priceFrom: '100000' })),
    );
  });

  it('changes when live stock availability changes', () => {
    expect(generatePublicHomepageEtag(payload({ inStock: false }))).not.toBe(
      generatePublicHomepageEtag(payload({ inStock: true })),
    );
  });

  it('changes when publication metadata changes', () => {
    expect(generatePublicHomepageEtag(payload({}, 2))).not.toBe(
      generatePublicHomepageEtag(payload({}, 1)),
    );
  });

  it('has a stable deterministic empty-homepage validator', () => {
    const empty: PublishedHomepageDto = {
      version: null,
      schemaVersion: null,
      publishedAt: null,
      sections: [],
    };
    expect(generatePublicHomepageEtag(empty)).toBe(
      generatePublicHomepageEtag({ ...empty }),
    );
    expect(generatePublicHomepageEtag(empty)).toMatch(/^"sha256-[A-Za-z0-9_-]+"$/);
  });

  it('matches exact, weak, list, and wildcard If-None-Match values', () => {
    const etag = generatePublicHomepageEtag(payload());
    expect(ifNoneMatchMatches(etag, etag)).toBe(true);
    expect(ifNoneMatchMatches(`W/${etag}`, etag)).toBe(true);
    expect(ifNoneMatchMatches(`"other", ${etag}`, etag)).toBe(true);
    expect(ifNoneMatchMatches('*', etag)).toBe(true);
    expect(ifNoneMatchMatches(undefined, etag)).toBe(false);
    expect(
      ifNoneMatchMatches(
        generatePublicHomepageEtag(payload({ priceFrom: '120000' })),
        etag,
      ),
    ).toBe(false);
  });
});
