import type {
  BlogPostCardDto,
  CatalogProductCardDto,
  HomepageSnapshot,
  MerchCampaignSnapshot,
} from '@sabz/types';
import { BlogService } from '../../blog/blog.service';
import { PrismaService } from '../../../common/database/prisma.service';
import { PublicCatalogService } from '../../products/public-catalog.service';
import { generatePublicHomepageEtag } from './public-homepage-etag';
import { PublicHomepageResolver } from './public-homepage.resolver';

function productCard(
  overrides: Partial<CatalogProductCardDto> = {},
): CatalogProductCardDto {
  return {
    id: 'product-1',
    name: 'محصول اول',
    slug: 'product-1',
    condition: 'NEW',
    brand: { name: 'برند', slug: 'brand' },
    category: { name: 'دسته', slug: 'category' },
    priceFrom: '100000',
    compareAtPrice: '150000',
    callForPrice: false,
    promotionEndsAt: null,
    variantCount: 1,
    inStock: true,
    ratingAverage: null,
    ratingCount: 0,
    primaryImageUrl: '/api/v1/catalog/media/p1',
    primaryThumbnailUrl: '/api/v1/catalog/media/p1/thumbnail',
    ...overrides,
  };
}

function campaign(
  overrides: Partial<MerchCampaignSnapshot> = {},
): MerchCampaignSnapshot {
  return {
    sourceCampaignId: 'campaign-1',
    type: 'SEASONAL',
    titleFa: 'Snapshot title',
    eyebrowFa: 'Snapshot eyebrow',
    subtitleFa: 'Snapshot subtitle',
    descriptionFa: null,
    ctaLabelFa: 'مشاهده',
    cta: { kind: 'NONE' },
    productIds: [],
    categoryIds: ['cat-1'],
    brandIds: ['brand-1'],
    media: [],
    startsAt: null,
    endsAt: null,
    ...overrides,
  };
}

describe('PublicHomepageResolver', () => {
  const p1 = productCard({ id: 'product-1', slug: 'product-1' });
  const p3 = productCard({
    id: 'product-3',
    slug: 'product-3',
    priceFrom: '200000',
    compareAtPrice: null,
    primaryImageUrl: null,
    primaryThumbnailUrl: null,
  });
  const post: BlogPostCardDto = {
    id: 'post-1',
    slug: 'post-1',
    title: 'مقاله',
    excerpt: 'خلاصه',
    coverImageUrl: null,
    category: null,
    authorName: null,
    publishedAt: '2026-01-01T00:00:00.000Z',
  };

  const publicCatalog = {
    getVisibleCardsByIds: jest.fn(),
    getCategoryTree: jest.fn(),
    getCategoryCovers: jest.fn(),
    listProducts: jest.fn(),
  };
  const blog = {
    getPublishedCardsByIds: jest.fn(),
    getLatestPublishedCards: jest.fn(),
  };
  const prisma = {
    brand: { findMany: jest.fn() },
    merchMedia: { findMany: jest.fn() },
    merchCampaign: { findMany: jest.fn() },
  };

  let resolver: PublicHomepageResolver;

  beforeEach(() => {
    jest.clearAllMocks();
    publicCatalog.getVisibleCardsByIds.mockResolvedValue([p1, p3]);
    publicCatalog.getCategoryTree.mockResolvedValue([
      {
        id: 'cat-1',
        name: 'دسته اول',
        slug: 'cat-1',
        sortOrder: 0,
        publishedProductCount: 2,
        children: [],
      },
      {
        id: 'cat-3',
        name: 'دسته خالی',
        slug: 'cat-3',
        sortOrder: 1,
        publishedProductCount: 0,
        children: [],
      },
    ]);
    publicCatalog.getCategoryCovers.mockResolvedValue([
      { slug: 'cat-1', imageUrl: '/api/v1/catalog/media/cover-1', alt: 'دسته' },
      { slug: 'cat-3', imageUrl: null, alt: 'دسته' },
    ]);
    publicCatalog.listProducts.mockResolvedValue({
      items: [p3, p1],
      total: 2,
      page: 1,
      limit: 10,
    });
    blog.getPublishedCardsByIds.mockResolvedValue([post]);
    blog.getLatestPublishedCards.mockResolvedValue([post]);
    prisma.brand.findMany.mockResolvedValue([
      { id: 'brand-1', name: 'برند', slug: 'brand' },
    ]);
    prisma.merchMedia.findMany.mockResolvedValue([
      { id: 'media-desktop', thumbnailKey: 'thumb' },
    ]);
    prisma.merchCampaign.findMany.mockResolvedValue([
      {
        id: 'campaign-1',
        isEnabled: true,
        archivedAt: null,
        startsAt: null,
        endsAt: null,
      },
    ]);
    resolver = new PublicHomepageResolver(
      prisma as unknown as PrismaService,
      publicCatalog as unknown as PublicCatalogService,
      blog as unknown as BlogService,
    );
  });

  it('resolves all nine visible section types in order using batched lookups', async () => {
    const snapshot: HomepageSnapshot = {
      schemaVersion: 1,
      sections: [
        {
          key: 'hero',
          type: 'HERO_CAROUSEL',
          order: 0,
          isVisible: true,
          settings: {
            campaigns: [
              campaign({
                titleFa: 'Snapshot hero title',
                cta: { kind: 'PRODUCT', productId: 'product-1' },
                productIds: ['product-1'],
                media: [
                  {
                    mediaId: 'media-desktop',
                    slot: 'HERO_DESKTOP',
                    altFa: 'alt',
                    focalX: 20,
                    focalY: 30,
                    sortOrder: 0,
                  },
                  {
                    mediaId: 'media-mobile',
                    slot: 'HERO_MOBILE',
                    altFa: 'mobile',
                    focalX: 50,
                    focalY: 50,
                    sortOrder: 1,
                  },
                ],
              }),
              campaign({
                titleFa: 'Invalid CTA title',
                cta: { kind: 'PRODUCT', productId: 'missing-product' },
                categoryIds: [],
                brandIds: [],
              }),
            ],
          },
        },
        {
          key: 'trust',
          type: 'TRUST_STRIP',
          order: 1,
          isVisible: true,
          settings: { items: [{ icon: 'shield', title: 'ضمانت' }] },
        },
        {
          key: 'discovery',
          type: 'CATEGORY_DISCOVERY',
          order: 2,
          isVisible: true,
          settings: {
            campaign: campaign({
              categoryIds: ['cat-1', 'cat-hidden', 'cat-3'],
            }),
          },
        },
        {
          key: 'offer',
          type: 'OFFER_STRIP',
          order: 3,
          isVisible: true,
          settings: {
            campaign: campaign({
              titleFa: 'Offer snapshot',
              cta: { kind: 'BRAND', brandId: 'brand-1' },
              productIds: ['product-1', 'product-3'],
            }),
            fallback: 'featured',
          },
        },
        {
          key: 'spotlight',
          type: 'CATEGORY_SPOTLIGHT',
          order: 4,
          isVisible: true,
          settings: {
            campaign: campaign({
              cta: { kind: 'CATEGORY', categoryId: 'cat-1' },
              categoryIds: ['cat-1', 'cat-3'],
            }),
            categoryId: 'cat-1',
            secondaryCategoryId: 'cat-3',
          },
        },
        {
          key: 'ready',
          type: 'READY_TO_SHIP',
          order: 5,
          isVisible: true,
          settings: { limit: 4, title: 'آماده ارسال' },
        },
        {
          key: 'rail',
          type: 'PRODUCT_RAIL',
          order: 6,
          isVisible: true,
          settings: {
            title: 'تازه‌ها',
            actionHref: '/products?sort=newest',
            source: {
              kind: 'query',
              categoryId: 'cat-1',
              brandId: 'brand-1',
              sort: 'newest',
              limit: 8,
              inStockOnly: true,
            },
          },
        },
        {
          key: 'brands',
          type: 'BRAND_SHOWCASE',
          order: 7,
          isVisible: true,
          settings: {
            campaign: campaign({
              brandIds: ['brand-1', 'brand-hidden'],
              productIds: ['product-1', 'product-3'],
            }),
            productsPerBrand: 3,
          },
        },
        {
          key: 'blog',
          type: 'BLOG_FEATURE',
          order: 8,
          isVisible: true,
          settings: { source: 'manual', postIds: ['post-1', 'missing-post'] },
        },
        {
          key: 'hidden',
          type: 'TRUST_STRIP',
          order: 9,
          isVisible: false,
          settings: { items: [{ icon: 'badge', title: 'مخفی' }] },
        },
      ],
    };

    const sections = await resolver.resolve(snapshot);
    expect(sections.map((section) => section.key)).toEqual([
      'hero',
      'trust',
      'discovery',
      'offer',
      'spotlight',
      'ready',
      'rail',
      'brands',
      'blog',
    ]);
    expect(sections.map((section) => section.type)).toEqual([
      'HERO_CAROUSEL',
      'TRUST_STRIP',
      'CATEGORY_DISCOVERY',
      'OFFER_STRIP',
      'CATEGORY_SPOTLIGHT',
      'READY_TO_SHIP',
      'PRODUCT_RAIL',
      'BRAND_SHOWCASE',
      'BLOG_FEATURE',
    ]);

    const hero = sections[0] as {
      slides: Array<{
        titleFa: string;
        href: string | null;
        desktopImageUrl: string | null;
        mobileImageUrl: string | null;
        cta: unknown;
        images: string[];
      }>;
    };
    expect(hero.slides[0]).toMatchObject({
      titleFa: 'Snapshot hero title',
      desktopImageUrl: '/api/v1/catalog/merch-media/media-desktop',
      mobileImageUrl: '/api/v1/catalog/merch-media/media-desktop',
      cta: { kind: 'PRODUCT', productId: 'product-1' },
    });
    expect(hero.slides[0]!.href).toBe('/products/product-1');
    expect(hero.slides[1]!.href).toBeNull();
    expect(hero.slides[0]!.images).toContain('/api/v1/catalog/media/p1/thumbnail');

    const discovery = sections[2] as {
      categories: Array<{ id: string; coverUrl: string | null }>;
    };
    expect(discovery.categories).toEqual([
      expect.objectContaining({
        id: 'cat-1',
        coverUrl: '/api/v1/catalog/media/cover-1',
      }),
    ]);

    const offer = sections[3] as {
      mode: string;
      products: Array<{ id: string; priceFrom: string }>;
      copy: { titleFa: string; href: string | null };
    };
    expect(offer.mode).toBe('offer');
    expect(offer.products.map((product) => product.id)).toEqual(['product-1']);
    expect(offer.copy).toMatchObject({
      titleFa: 'Offer snapshot',
      href: '/products?brand=brand',
    });

    const spotlight = sections[4] as {
      category: { id: string };
      secondaryCount: number;
      copy: { href: string | null };
    };
    expect(spotlight.category.id).toBe('cat-1');
    expect(spotlight.secondaryCount).toBe(0);
    expect(spotlight.copy.href).toBe('/categories/cat-1');

    expect(
      (sections[5] as { products: Array<{ id: string }> }).products.map(
        (product) => product.id,
      ),
    ).toEqual(['product-3', 'product-1']);
    expect(
      (sections[6] as { products: Array<{ id: string }> }).products.map(
        (product) => product.id,
      ),
    ).toEqual(['product-3', 'product-1']);
    expect(
      sections[7] as {
        groups: Array<{ brand: { slug: string }; products: Array<{ id: string }> }>;
      },
    ).toEqual({
      key: 'brands',
      type: 'BRAND_SHOWCASE',
      order: 7,
      groups: [
        {
          brand: { name: 'برند', slug: 'brand' },
          products: [p1, p3],
        },
      ],
    });
    expect(
      (sections[8] as { posts: Array<{ id: string }> }).posts.map(
        (post) => post.id,
      ),
    ).toEqual(['post-1']);

    expect(publicCatalog.getVisibleCardsByIds).toHaveBeenCalledTimes(1);
    expect(publicCatalog.getCategoryTree).toHaveBeenCalledTimes(1);
    expect(publicCatalog.getCategoryCovers).toHaveBeenCalledTimes(1);
    expect(publicCatalog.listProducts).toHaveBeenCalledTimes(2);
    expect(blog.getPublishedCardsByIds).toHaveBeenCalledTimes(1);
    expect(blog.getLatestPublishedCards).not.toHaveBeenCalled();
  });

  it('omits empty sections instead of returning misleading placeholders', async () => {
    publicCatalog.getVisibleCardsByIds.mockResolvedValue([]);
    publicCatalog.getCategoryTree.mockResolvedValue([]);
    publicCatalog.getCategoryCovers.mockResolvedValue([]);
    publicCatalog.listProducts.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 10,
    });
    blog.getPublishedCardsByIds.mockResolvedValue([]);

    const snapshot: HomepageSnapshot = {
      schemaVersion: 1,
      sections: [
        {
          key: 'ready',
          type: 'READY_TO_SHIP',
          order: 0,
          isVisible: true,
          settings: { limit: 4 },
        },
        {
          key: 'rail',
          type: 'PRODUCT_RAIL',
          order: 1,
          isVisible: true,
          settings: {
            title: 'خالی',
            source: {
              kind: 'query',
              categoryId: 'cat-1',
              brandId: null,
              sort: 'newest',
              limit: 8,
              inStockOnly: false,
            },
          },
        },
        {
          key: 'blog',
          type: 'BLOG_FEATURE',
          order: 2,
          isVisible: true,
          settings: { source: 'manual', postIds: ['missing'] },
        },
      ],
    };
    await expect(resolver.resolve(snapshot)).resolves.toEqual([]);
  });

  it('uses the latest blog query and keeps snapshot CTA targets honest', async () => {
    const snapshot: HomepageSnapshot = {
      schemaVersion: 1,
      sections: [
        {
          key: 'blog',
          type: 'BLOG_FEATURE',
          order: 0,
          isVisible: true,
          settings: { source: 'latest', limit: 3 },
        },
        {
          key: 'offer',
          type: 'OFFER_STRIP',
          order: 1,
          isVisible: true,
          settings: {
            campaign: campaign({
              cta: { kind: 'PRODUCT', productId: 'missing' },
              productIds: ['product-1'],
            }),
            fallback: 'featured',
          },
        },
      ],
    };
    const sections = await resolver.resolve(snapshot);
    expect(blog.getLatestPublishedCards).toHaveBeenCalledWith(3);
    expect(
      (sections.find((section) => section.key === 'blog') as {
        posts: Array<{ id: string }>;
      }).posts.map((item) => item.id),
    ).toEqual(['post-1']);
    expect(
      (sections.find((section) => section.key === 'offer') as {
        copy: { href: string | null };
      }).copy.href,
    ).toBeNull();
  });

  it('keeps eligible campaigns in multi-campaign sections and drops ineligible sections', async () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    prisma.merchCampaign.findMany.mockResolvedValue([
      {
        id: 'campaign-1',
        isEnabled: true,
        archivedAt: null,
        startsAt: new Date(now.getTime() - 60_000),
        endsAt: new Date(now.getTime() + 60_000),
      },
      {
        id: 'campaign-2',
        isEnabled: true,
        archivedAt: null,
        startsAt: new Date(now.getTime() + 60_000),
        endsAt: new Date(now.getTime() + 120_000),
      },
    ]);
    const futureCampaign = campaign({
      sourceCampaignId: 'campaign-2',
      titleFa: 'Future campaign',
    });
    const snapshot: HomepageSnapshot = {
      schemaVersion: 1,
      sections: [
        {
          key: 'hero',
          type: 'HERO_CAROUSEL',
          order: 0,
          isVisible: true,
          settings: {
            campaigns: [campaign({ titleFa: 'Eligible campaign' }), futureCampaign],
          },
        },
        {
          key: 'offer',
          type: 'OFFER_STRIP',
          order: 1,
          isVisible: true,
          settings: { campaign: futureCampaign, fallback: 'featured' },
        },
        {
          key: 'rail',
          type: 'PRODUCT_RAIL',
          order: 2,
          isVisible: true,
          settings: {
            title: 'Future rail',
            source: { kind: 'campaign', campaign: futureCampaign },
          },
        },
      ],
    };

    const sections = await resolver.resolve(snapshot, now);
    expect(sections.map((section) => section.key)).toEqual(['hero']);
    const hero = sections[0] as { slides: Array<{ titleFa: string }> };
    expect(hero.slides.map((slide) => slide.titleFa)).toEqual(['Eligible campaign']);
  });

  it.each([
    ['disabled', { isEnabled: false }],
    ['archived', { archivedAt: new Date('2026-05-31T23:00:00.000Z') }],
    ['expired', { endsAt: new Date('2026-05-31T23:00:00.000Z') }],
  ])('hides campaign-backed content when the campaign is %s', async (_label, state) => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    prisma.merchCampaign.findMany.mockResolvedValue([
      {
        id: 'campaign-1',
        isEnabled: true,
        archivedAt: null,
        startsAt: null,
        endsAt: null,
        ...state,
      },
    ]);
    const snapshot: HomepageSnapshot = {
      schemaVersion: 1,
      sections: [
        {
          key: 'hero',
          type: 'HERO_CAROUSEL',
          order: 0,
          isVisible: true,
          settings: { campaigns: [campaign()] },
        },
        {
          key: 'offer',
          type: 'OFFER_STRIP',
          order: 1,
          isVisible: true,
          settings: { campaign: campaign(), fallback: 'featured' },
        },
      ],
    };

    await expect(resolver.resolve(snapshot, now)).resolves.toEqual([]);
  });

  it('changes the public ETag when campaign eligibility removes content', async () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const snapshot: HomepageSnapshot = {
      schemaVersion: 1,
      sections: [
        {
          key: 'hero',
          type: 'HERO_CAROUSEL',
          order: 0,
          isVisible: true,
          settings: { campaigns: [campaign()] },
        },
      ],
    };
    prisma.merchCampaign.findMany.mockResolvedValue([
      {
        id: 'campaign-1',
        isEnabled: true,
        archivedAt: null,
        startsAt: null,
        endsAt: null,
      },
    ]);
    const eligibleSections = await resolver.resolve(snapshot, now);

    prisma.merchCampaign.findMany.mockResolvedValue([
      {
        id: 'campaign-1',
        isEnabled: false,
        archivedAt: null,
        startsAt: null,
        endsAt: null,
      },
    ]);
    const ineligibleSections = await resolver.resolve(snapshot, now);

    const base = {
      version: 1,
      schemaVersion: 1,
      publishedAt: '2026-06-01T00:00:00.000Z',
    };
    expect(
      generatePublicHomepageEtag({ ...base, sections: eligibleSections }),
    ).not.toBe(
      generatePublicHomepageEtag({ ...base, sections: ineligibleSections }),
    );
  });
});
