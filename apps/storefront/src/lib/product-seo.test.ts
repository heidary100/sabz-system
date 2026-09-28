import { describe, expect, it } from 'vitest';
import type {
  CatalogProductDetailDto,
  CatalogProductMediaDto,
} from '@sabz/types';
import { buildProductJsonLd, selectOgImage } from './product-seo';

function media(
  id: string,
  overrides: Partial<CatalogProductMediaDto> = {},
): CatalogProductMediaDto {
  return {
    id,
    mediaType: 'IMAGE',
    url: `/api/v1/catalog/media/${id}`,
    thumbnailUrl: null,
    isPrimary: false,
    sortOrder: 0,
    variantId: null,
    ...overrides,
  };
}

function detail(
  overrides: Partial<CatalogProductDetailDto> = {},
): CatalogProductDetailDto {
  return {
    id: 'p1',
    name: 'گوشی',
    slug: 'phone',
    nameEn: null,
    subtitle: null,
    shortDescription: null,
    description: null,
    condition: 'NEW',
    warranty: null,
    metaTitle: null,
    metaDescription: null,
    weightKg: null,
    widthCm: null,
    heightCm: null,
    depthCm: null,
    originCountry: null,
    brand: { name: 'برند', slug: 'brand' },
    category: { name: 'دسته', slug: 'cat' },
    categoryBreadcrumb: [],
    variants: [],
    media: [],
    specs: [],
    tags: [],
    inStock: false,
    promotionEndsAt: null,
    related: [],
    previous: null,
    next: null,
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe('selectOgImage', () => {
  it('prefers the primary image, then the first image, never video', () => {
    const video = media('v', { mediaType: 'VIDEO' });
    const first = media('a');
    const primary = media('b', { isPrimary: true });
    expect(selectOgImage([video, first, primary])?.id).toBe('b');
    expect(selectOgImage([video, first])?.id).toBe('a');
  });

  it('returns null when no image exists', () => {
    expect(selectOgImage([])).toBeNull();
    expect(selectOgImage([media('v', { mediaType: 'VIDEO' })])).toBeNull();
  });
});

describe('buildProductJsonLd', () => {
  const url = 'https://shop.example/products/phone';

  it('emits a single Offer for one priced variant', () => {
    const jsonLd = buildProductJsonLd({
      product: detail({
        variants: [
          {
            id: 'v1',
            sku: 'SKU-1',
            name: null,
            price: '1000000',
            compareAtPrice: null,
            priceStatus: 'PRICED',
            inStock: true,
            options: [],
          },
        ],
      }),
      canonicalUrl: url,
      imageUrls: ['https://shop.example/img.jpg'],
    });
    expect(jsonLd['@type']).toBe('Product');
    expect(jsonLd.offers).toMatchObject({
      '@type': 'Offer',
      priceCurrency: 'IRT',
      // Toman presentation price (SS-222): API Rial 1,000,000 ÷ 10.
      price: '100000',
      availability: 'https://schema.org/InStock',
    });
    expect(jsonLd.image).toEqual(['https://shop.example/img.jpg']);
  });

  it('emits an AggregateOffer over priced variants only', () => {
    const jsonLd = buildProductJsonLd({
      product: detail({
        variants: [
          {
            id: 'v1',
            sku: 'SKU-1',
            name: null,
            price: '1000000',
            compareAtPrice: null,
            priceStatus: 'PRICED',
            inStock: true,
            options: [],
          },
          {
            id: 'v2',
            sku: 'SKU-2',
            name: null,
            price: '2000000',
            compareAtPrice: null,
            priceStatus: 'PRICED',
            inStock: false,
            options: [],
          },
          {
            id: 'v3',
            sku: 'SKU-3',
            name: null,
            price: '0',
            compareAtPrice: null,
            priceStatus: 'CALL_FOR_PRICE',
            inStock: true,
            options: [],
          },
        ],
      }),
      canonicalUrl: url,
      imageUrls: [],
    });
    expect(jsonLd.offers).toMatchObject({
      '@type': 'AggregateOffer',
      offerCount: 2,
      lowPrice: '100000',
      highPrice: '200000',
    });
    expect(jsonLd).not.toHaveProperty('image');
  });

  it('creates no fake offer for call-for-price-only products', () => {
    const jsonLd = buildProductJsonLd({
      product: detail({
        variants: [
          {
            id: 'v3',
            sku: 'SKU-3',
            name: null,
            price: '0',
            compareAtPrice: null,
            priceStatus: 'CALL_FOR_PRICE',
            inStock: false,
            options: [],
          },
        ],
      }),
      canonicalUrl: url,
      imageUrls: [],
    });
    expect(jsonLd).not.toHaveProperty('offers');
  });

  it('uses SEO fallbacks for description and omits empty fields', () => {
    const withMeta = buildProductJsonLd({
      product: detail({ metaDescription: 'متا' }),
      canonicalUrl: url,
      imageUrls: [],
    });
    expect(withMeta.description).toBe('متا');
    const withHtml = buildProductJsonLd({
      product: detail({ description: '<p>متن <strong>غنی</strong></p>' }),
      canonicalUrl: url,
      imageUrls: [],
    });
    expect(withHtml.description).toBe('متن غنی');
    const bare = buildProductJsonLd({
      product: detail({ brand: null }),
      canonicalUrl: url,
      imageUrls: [],
    });
    expect(bare).not.toHaveProperty('description');
    expect(bare).not.toHaveProperty('brand');
  });
});
