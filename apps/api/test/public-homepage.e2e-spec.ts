import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { PublicHomepageCache } from '../src/modules/merchandising/homepage/public-homepage.cache';

jest.setTimeout(90_000);

const BASE = '/api/v1/catalog/homepage';

function token(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('Public homepage resolver API (Task 05.5) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cache: PublicHomepageCache;

  const publicationIds: string[] = [];
  const campaignIds: string[] = [];
  const productIds: string[] = [];
  const productMediaIds: string[] = [];
  const variantIds: string[] = [];
  const inventoryItemIds: string[] = [];
  const categoryIds: string[] = [];
  const brandIds: string[] = [];
  const mediaIds: string[] = [];
  const blogPostIds: string[] = [];
  let warehouseId = '';

  let categoryId = '';
  let hiddenCategoryId = '';
  let emptyCategoryId = '';
  let brandId = '';
  let deletedBrandId = '';
  let p1 = '';
  let p1Variant = '';
  let p2 = '';
  let p3 = '';
  let p4 = '';
  let desktopMedia = '';
  let mobileMedia = '';
  let deletedMedia = '';
  let publishedPost = '';
  let draftPost = '';
  let campaignId = '';
  let snapshot: Record<string, unknown>;

  let version = 0;
  let initialPublicationId = '';

  function nextVersion(): number {
    version += 1;
    return version;
  }

  async function createPublication(
    sections: unknown,
    status: 'PUBLISHED' | 'SCHEDULED' | 'SUPERSEDED' | 'CANCELLED',
    schemaVersion = 1,
  ) {
    const row = await prisma.homepagePublication.create({
      data: {
        version: nextVersion(),
        status,
        publishAt:
          status === 'SCHEDULED' ? new Date(Date.now() + 3_600_000) : null,
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
        sections: sections as object,
        schemaVersion,
        sourceDraftRevision: 7,
      },
    });
    publicationIds.push(row.id);
    return row;
  }

  function campaignSnapshot(overrides: Record<string, unknown> = {}) {
    return {
      sourceCampaignId: campaignId,
      type: 'SEASONAL',
      titleFa: 'Snapshot campaign title',
      eyebrowFa: 'Snapshot eyebrow',
      subtitleFa: 'Snapshot subtitle',
      descriptionFa: 'Snapshot description',
      ctaLabelFa: 'مشاهده',
      cta: { kind: 'NONE' },
      productIds: [],
      categoryIds: [categoryId],
      brandIds: [brandId],
      media: [],
      startsAt: null,
      endsAt: null,
      ...overrides,
    };
  }

  function buildSnapshot() {
    const heroCampaign = campaignSnapshot({
      titleFa: 'Snapshot hero title',
      cta: { kind: 'PRODUCT', productId: p1 },
      productIds: [p1, p2],
      media: [
        {
          mediaId: desktopMedia,
          slot: 'HERO_DESKTOP',
          altFa: 'Snapshot desktop alt',
          focalX: 20,
          focalY: 30,
          sortOrder: 0,
        },
        {
          mediaId: mobileMedia,
          slot: 'HERO_MOBILE',
          altFa: 'Unpublished mobile alt',
          focalX: 50,
          focalY: 50,
          sortOrder: 1,
        },
        {
          mediaId: deletedMedia,
          slot: 'BANNER',
          altFa: 'Deleted alt',
          focalX: 50,
          focalY: 50,
          sortOrder: 2,
        },
      ],
    });
    const invalidCtaCampaign = campaignSnapshot({
      titleFa: 'Invalid CTA slide',
      cta: { kind: 'PRODUCT', productId: randomUUID() },
      categoryIds: [],
      brandIds: [],
    });
    const discoveryCampaign = campaignSnapshot({
      titleFa: 'Discovery snapshot',
      categoryIds: [categoryId, hiddenCategoryId, emptyCategoryId],
      productIds: [],
      brandIds: [],
    });
    const offerCampaign = campaignSnapshot({
      titleFa: 'Offer snapshot',
      cta: { kind: 'BRAND', brandId },
      productIds: [p1, p2],
    });
    const spotlightCampaign = campaignSnapshot({
      titleFa: 'Spotlight snapshot',
      cta: { kind: 'CATEGORY', categoryId },
      categoryIds: [categoryId, hiddenCategoryId],
      productIds: [],
    });
    const brandCampaign = campaignSnapshot({
      titleFa: 'Brand snapshot',
      cta: { kind: 'NONE' },
      brandIds: [brandId, deletedBrandId],
      productIds: [p1, p3],
    });

    return {
      schemaVersion: 1,
      sections: [
        {
          key: 'hero',
          type: 'HERO_CAROUSEL',
          order: 0,
          isVisible: true,
          settings: { campaigns: [heroCampaign, invalidCtaCampaign] },
        },
        {
          key: 'trust',
          type: 'TRUST_STRIP',
          order: 1,
          isVisible: true,
          settings: {
            items: [
              { icon: 'shield', title: 'ضمانت اصالت' },
              { icon: 'truck', title: 'ارسال سریع', body: 'ارسال به سراسر کشور' },
            ],
          },
        },
        {
          key: 'discovery',
          type: 'CATEGORY_DISCOVERY',
          order: 2,
          isVisible: true,
          settings: { campaign: discoveryCampaign },
        },
        {
          key: 'offer',
          type: 'OFFER_STRIP',
          order: 3,
          isVisible: true,
          settings: { campaign: offerCampaign, fallback: 'featured' },
        },
        {
          key: 'spotlight',
          type: 'CATEGORY_SPOTLIGHT',
          order: 4,
          isVisible: true,
          settings: {
            campaign: spotlightCampaign,
            categoryId,
            secondaryCategoryId: hiddenCategoryId,
          },
        },
        {
          key: 'ready',
          type: 'READY_TO_SHIP',
          order: 5,
          isVisible: true,
          settings: { limit: 4, title: 'آماده ارسال', subtitle: 'موجودی واقعی' },
        },
        {
          key: 'rail',
          type: 'PRODUCT_RAIL',
          order: 6,
          isVisible: true,
          settings: {
            title: 'تازه‌ها',
            subtitle: 'جدیدترین محصولات',
            actionHref: '/products?sort=newest',
            source: {
              kind: 'query',
              categoryId,
              brandId,
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
          settings: { campaign: brandCampaign, productsPerBrand: 3 },
        },
        {
          key: 'blog',
          type: 'BLOG_FEATURE',
          order: 8,
          isVisible: true,
          settings: {
            source: 'manual',
            postIds: [publishedPost, draftPost, randomUUID()],
          },
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
  }

  async function createProduct(args: {
    slug: string;
    name: string;
    categoryId: string;
    brandId: string | null;
    status: 'PUBLISHED' | 'DRAFT';
    price: string;
    compareAtPrice: string | null;
    stock: number;
    createdAt: Date;
  }) {
    const product = await prisma.product.create({
      data: {
        name: args.name,
        slug: args.slug,
        categoryId: args.categoryId,
        brandId: args.brandId,
        condition: 'NEW',
        status: args.status,
        minPrice: args.price,
        createdAt: args.createdAt,
      },
    });
    productIds.push(product.id);
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: token('SKU'),
        price: args.price,
        compareAtPrice: args.compareAtPrice,
      },
    });
    variantIds.push(variant.id);
    const inventory = await prisma.inventoryItem.create({
      data: {
        warehouseId,
        variantId: variant.id,
        quantityOnHand: args.stock,
      },
    });
    inventoryItemIds.push(inventory.id);
    return { product, variant };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    cache = app.get(PublicHomepageCache);

    await prisma.homepagePublication.deleteMany({});
    await prisma.homepageDraft.deleteMany({ where: { id: 'homepage' } });

    const warehouse = await prisma.warehouse.create({
      data: { code: token('WH'), name: 'انبار تست' },
    });
    warehouseId = warehouse.id;

    const category = await prisma.category.create({
      data: { name: 'دسته اصلی', slug: token('cat') },
    });
    categoryId = category.id;
    categoryIds.push(category.id);
    const hiddenCategory = await prisma.category.create({
      data: { name: 'دسته مخفی', slug: token('cat-hidden') },
    });
    hiddenCategoryId = hiddenCategory.id;
    categoryIds.push(hiddenCategory.id);
    const emptyCategory = await prisma.category.create({
      data: { name: 'دسته خالی', slug: token('cat-empty') },
    });
    emptyCategoryId = emptyCategory.id;
    categoryIds.push(emptyCategory.id);

    const brand = await prisma.brand.create({
      data: { name: 'برند اصلی', slug: token('brand') },
    });
    brandId = brand.id;
    brandIds.push(brand.id);
    const deletedBrand = await prisma.brand.create({
      data: { name: 'برند حذف‌شده', slug: token('brand-deleted') },
    });
    deletedBrandId = deletedBrand.id;
    brandIds.push(deletedBrand.id);

    const first = await createProduct({
      slug: token('p1'),
      name: 'محصول اول',
      categoryId,
      brandId,
      status: 'PUBLISHED',
      price: '100000.00',
      compareAtPrice: '150000.00',
      stock: 5,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    p1 = first.product.id;
    p1Variant = first.variant.id;
    const second = await createProduct({
      slug: token('p2'),
      name: 'محصول پیش‌نویس',
      categoryId,
      brandId,
      status: 'DRAFT',
      price: '90000.00',
      compareAtPrice: null,
      stock: 10,
      createdAt: new Date('2026-01-05T00:00:00.000Z'),
    });
    p2 = second.product.id;
    const third = await createProduct({
      slug: token('p3'),
      name: 'محصول سوم',
      categoryId,
      brandId,
      status: 'PUBLISHED',
      price: '200000.00',
      compareAtPrice: null,
      stock: 2,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    p3 = third.product.id;
    const fourth = await createProduct({
      slug: token('p4'),
      name: 'محصول چهارم',
      categoryId,
      brandId,
      status: 'PUBLISHED',
      price: '50000.00',
      compareAtPrice: null,
      stock: 3,
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
    });
    p4 = fourth.product.id;

    const productMedia = await prisma.productMedia.create({
      data: {
        productId: p1,
        mediaType: 'IMAGE',
        originalName: 'p1.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        storageKey: token('product-media'),
        isPrimary: true,
        sortOrder: 0,
      },
    });
    productMediaIds.push(productMedia.id);

    const desktop = await prisma.merchMedia.create({
      data: {
        originalName: 'desktop.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        storageKey: token('merch-desktop'),
        thumbnailKey: token('thumb'),
        altFa: 'desktop row alt',
        publishedAt: new Date(),
      },
    });
    desktopMedia = desktop.id;
    mediaIds.push(desktop.id);
    const mobile = await prisma.merchMedia.create({
      data: {
        originalName: 'mobile.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        storageKey: token('merch-mobile'),
        publishedAt: null,
      },
    });
    mobileMedia = mobile.id;
    mediaIds.push(mobile.id);
    const deleted = await prisma.merchMedia.create({
      data: {
        originalName: 'deleted.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        storageKey: token('merch-deleted'),
        publishedAt: new Date(),
        deletedAt: new Date(),
      },
    });
    deletedMedia = deleted.id;
    mediaIds.push(deleted.id);

    await prisma.category.update({
      where: { id: hiddenCategoryId },
      data: { isVisible: false },
    });
    await prisma.brand.update({
      where: { id: deletedBrandId },
      data: { deletedAt: new Date() },
    });

    const published = await prisma.blogPost.create({
      data: {
        slug: token('post'),
        title: 'مقاله منتشرشده',
        excerpt: 'خلاصه مقاله',
        content: '<p>متن</p>',
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    publishedPost = published.id;
    blogPostIds.push(published.id);
    const draft = await prisma.blogPost.create({
      data: {
        slug: token('post-draft'),
        title: 'مقاله پیش‌نویس',
        content: '<p>متن</p>',
        status: 'DRAFT',
      },
    });
    draftPost = draft.id;
    blogPostIds.push(draft.id);

    const campaign = await prisma.merchCampaign.create({
      data: {
        internalName: token('campaign'),
        type: 'SEASONAL',
        titleFa: 'Live campaign title',
      },
    });
    campaignId = campaign.id;
    campaignIds.push(campaign.id);

    snapshot = buildSnapshot();
  });

  afterAll(async () => {
    await prisma.homepagePublication.deleteMany({
      where: { id: { in: publicationIds } },
    });
    await prisma.homepageDraft.deleteMany({ where: { id: 'homepage' } });
    await prisma.inventoryItem.deleteMany({
      where: { id: { in: inventoryItemIds } },
    });
    await prisma.productVariant.deleteMany({
      where: { id: { in: variantIds } },
    });
    await prisma.productMedia.deleteMany({
      where: { id: { in: productMediaIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.merchCampaign.deleteMany({ where: { id: { in: campaignIds } } });
    await prisma.merchMedia.deleteMany({ where: { id: { in: mediaIds } } });
    await prisma.blogPost.deleteMany({ where: { id: { in: blogPostIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: brandIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    await app.close();
  });

  it('returns a deterministic empty homepage when no publication exists', async () => {
    cache.clear();
    const res = await request(app.getHttpServer()).get(BASE).expect(200);
    expect(res.body).toEqual({
      version: null,
      schemaVersion: null,
      publishedAt: null,
      sections: [],
    });
    expect(res.headers['cache-control']).toContain('public, max-age=10');
    expect(res.headers.etag).toMatch(/^"sha256-[A-Za-z0-9_-]+"$/);

    const repeated = await request(app.getHttpServer()).get(BASE).expect(200);
    expect(repeated.headers.etag).toBe(res.headers.etag);

    const notModified = await request(app.getHttpServer())
      .get(BASE)
      .set('If-None-Match', res.headers.etag as string)
      .expect(304);
    expect(notModified.headers.etag).toBe(res.headers.etag);
    expect(notModified.text).toBe('');
  });

  it('requires no authentication and resolves all nine visible section types', async () => {
    const publication = await createPublication(snapshot, 'PUBLISHED');
    initialPublicationId = publication.id;
    cache.clear();
    const res = await request(app.getHttpServer()).get(BASE).expect(200);
    expect(res.body.version).toBe(1);
    expect(res.body.schemaVersion).toBe(1);
    expect(res.body.publishedAt).not.toBeNull();
    expect(res.headers.etag).toMatch(/^"sha256-[A-Za-z0-9_-]+"$/);

    const sections = res.body.sections as Array<Record<string, unknown>>;
    const ready = sections.find((section) => section.key === 'ready') as {
      products: Array<{ id: string }>;
    };
    expect(ready.products.map((product) => product.id)).toEqual([p4, p3, p1]);
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
    expect(sections.some((section) => section.key === 'hidden')).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('storageKey');
  });

  it('derives campaign copy and CTA from the snapshot, not the mutable campaign', async () => {
    const res = await request(app.getHttpServer()).get(BASE).expect(200);
    const hero = (res.body.sections as Array<Record<string, unknown>>).find(
      (section) => section.key === 'hero',
    ) as { slides: Array<Record<string, unknown>> };
    expect(hero.slides).toHaveLength(2);
    expect(hero.slides[0]).toMatchObject({
      campaignType: 'SEASONAL',
      eyebrowFa: 'Snapshot eyebrow',
      titleFa: 'Snapshot hero title',
      ctaLabel: 'مشاهده',
      cta: { kind: 'PRODUCT', productId: p1 },
    });
    expect(hero.slides[0]!.href).toBe(
      `/products/${encodeURIComponent((await prisma.product.findUniqueOrThrow({ where: { id: p1 } })).slug)}`,
    );
    expect(hero.slides[0]!.desktopImageUrl).toBe(
      `/api/v1/catalog/merch-media/${desktopMedia}`,
    );
    expect(hero.slides[0]!.mobileImageUrl).toBe(
      `/api/v1/catalog/merch-media/${desktopMedia}`,
    );
    expect(JSON.stringify(res.body)).not.toContain(mobileMedia);
    expect(JSON.stringify(res.body)).not.toContain(deletedMedia);
    expect(hero.slides[1]!.href).toBeNull();

    const offer = (res.body.sections as Array<Record<string, unknown>>).find(
      (section) => section.key === 'offer',
    ) as { copy: Record<string, unknown> };
    expect(offer.copy).toMatchObject({
      campaignType: 'SEASONAL',
      titleFa: 'Offer snapshot',
      cta: { kind: 'BRAND', brandId },
      href: `/products?brand=${encodeURIComponent(
        (await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })).slug,
      )}`,
    });

    await prisma.merchCampaign.update({
      where: { id: campaignId },
      data: { titleFa: 'Changed live campaign title' },
    });
    await prisma.homepageDraft.create({
      data: {
        id: 'homepage',
        revision: 1,
        sections: [
          {
            key: 'draft-only',
            type: 'TRUST_STRIP',
            order: 0,
            isVisible: true,
            settings: { items: [{ icon: 'badge', title: 'پیش‌نویس' }] },
          },
        ],
      },
    });
    cache.clear();
    const afterEdits = await request(app.getHttpServer()).get(BASE).expect(200);
    const afterHero = (
      afterEdits.body.sections as Array<Record<string, unknown>>
    ).find((section) => section.key === 'hero') as {
      slides: Array<Record<string, unknown>>;
    };
    expect(afterHero.slides[0]!.titleFa).toBe('Snapshot hero title');
    expect(
      (afterEdits.body.sections as Array<Record<string, unknown>>).some(
        (section) => section.key === 'draft-only',
      ),
    ).toBe(false);
  });

  it('removes campaign-backed sections when current eligibility lapses', async () => {
    const original = await prisma.merchCampaign.findUniqueOrThrow({
      where: { id: campaignId },
    });
    const activeBefore = await request(app.getHttpServer()).get(BASE).expect(200);
    const activeEtag = activeBefore.headers.etag as string;
    const now = Date.now();
    try {
      await prisma.merchCampaign.update({
        where: { id: campaignId },
        data: {
          startsAt: new Date(now + 3_600_000),
          endsAt: new Date(now + 7_200_000),
        },
      });
      cache.clear();
      const future = await request(app.getHttpServer()).get(BASE).expect(200);
      constraints(future, false);
      expect(future.headers.etag).not.toBe(activeEtag);

      await prisma.merchCampaign.update({
        where: { id: campaignId },
        data: {
          startsAt: new Date(now - 7_200_000),
          endsAt: new Date(now - 3_600_000),
        },
      });
      cache.clear();
      const expired = await request(app.getHttpServer()).get(BASE).expect(200);
      constraints(expired, false);

      await prisma.merchCampaign.update({
        where: { id: campaignId },
        data: { isEnabled: false, startsAt: null, endsAt: null },
      });
      cache.clear();
      const disabled = await request(app.getHttpServer()).get(BASE).expect(200);
      constraints(disabled, false);

      await prisma.merchCampaign.update({
        where: { id: campaignId },
        data: {
          isEnabled: true,
          archivedAt: new Date(now - 3_600_000),
        },
      });
      cache.clear();
      const archived = await request(app.getHttpServer()).get(BASE).expect(200);
      constraints(archived, false);
    } finally {
      await prisma.merchCampaign.update({
        where: { id: campaignId },
        data: {
          isEnabled: original.isEnabled,
          archivedAt: original.archivedAt,
          startsAt: original.startsAt,
          endsAt: original.endsAt,
        },
      });
      cache.clear();
    }

    const active = await request(app.getHttpServer()).get(BASE).expect(200);
    constraints(active, true);

    function constraints(
      response: { body: { sections: Array<{ key: string }> } },
      campaignSectionsVisible: boolean,
    ): void {
      const sections = response.body.sections;
      const keys = sections.map((section) => section.key);
      expect(keys.includes('hero')).toBe(campaignSectionsVisible);
      expect(keys.includes('discovery')).toBe(campaignSectionsVisible);
      expect(keys.includes('offer')).toBe(campaignSectionsVisible);
      expect(keys.includes('spotlight')).toBe(campaignSectionsVisible);
      expect(keys.includes('brands')).toBe(campaignSectionsVisible);
      expect(keys.includes('trust')).toBe(true);
    }
  });

  it('serves 304 only while the resolved representation is unchanged', async () => {
    const first = await request(app.getHttpServer()).get(BASE).expect(200);
    const etag = first.headers.etag as string;

    const exact = await request(app.getHttpServer())
      .get(BASE)
      .set('If-None-Match', etag)
      .expect(304);
    expect(exact.headers.etag).toBe(etag);
    expect(exact.text).toBe('');

    await request(app.getHttpServer())
      .get(BASE)
      .set('If-None-Match', `W/${etag}`)
      .expect(304);
    await request(app.getHttpServer())
      .get(BASE)
      .set('If-None-Match', `"other", ${etag}`)
      .expect(304);
    await request(app.getHttpServer())
      .get(BASE)
      .set('If-None-Match', '*')
      .expect(304);

    const stale = await request(app.getHttpServer())
      .get(BASE)
      .set('If-None-Match', '"sha256-stale"')
      .expect(200);
    expect(stale.headers.etag).toBe(etag);
  });

  it('resolves live price and stock while respecting the cache bound', async () => {
    const first = await request(app.getHttpServer()).get(BASE).expect(200);
    const beforePriceEtag = first.headers.etag as string;
    const firstOffer = (
      first.body.sections as Array<Record<string, unknown>>
    ).find((section) => section.key === 'offer') as {
      products: Array<{ id: string; priceFrom: string; inStock: boolean }>;
    };
    expect(firstOffer.products[0]!.priceFrom).toBe('100000');
    expect(firstOffer.products[0]!.inStock).toBe(true);

    await prisma.product.update({
      where: { id: p1 },
      data: { minPrice: '120000.00' },
    });
    await prisma.productVariant.update({
      where: { id: p1Variant },
      data: { price: '120000.00' },
    });

    const cached = await request(app.getHttpServer()).get(BASE).expect(200);
    expect(cached.headers.etag).toBe(beforePriceEtag);
    const cachedOffer = (
      cached.body.sections as Array<Record<string, unknown>>
    ).find((section) => section.key === 'offer') as {
      products: Array<{ id: string; priceFrom: string }>;
    };
    expect(cachedOffer.products[0]!.priceFrom).toBe('100000');

    cache.clear();
    const refreshed = await request(app.getHttpServer())
      .get(BASE)
      .set('If-None-Match', beforePriceEtag)
      .expect(200);
    expect(refreshed.headers.etag).not.toBe(beforePriceEtag);
    const refreshedEtag = refreshed.headers.etag as string;
    const refreshedOffer = (
      refreshed.body.sections as Array<Record<string, unknown>>
    ).find((section) => section.key === 'offer') as {
      products: Array<{ id: string; priceFrom: string; inStock: boolean }>;
    };
    expect(refreshedOffer.products[0]!.priceFrom).toBe('120000');
    expect(refreshedOffer.products[0]!.inStock).toBe(true);

    const inventory = await prisma.inventoryItem.findFirstOrThrow({
      where: { variantId: p1Variant },
    });
    await prisma.inventoryItem.update({
      where: { id: inventory.id },
      data: { quantityOnHand: 0 },
    });
    cache.clear();
    const outOfStock = await request(app.getHttpServer()).get(BASE).expect(200);
    expect(outOfStock.headers.etag).not.toBe(refreshedEtag);
    expect(
      (outOfStock.body.sections as Array<Record<string, unknown>>).some(
        (section) => section.key === 'offer',
      ),
    ).toBe(false);
    const brandSection = (
      outOfStock.body.sections as Array<Record<string, unknown>>
    ).find((section) => section.key === 'brands') as {
      groups: Array<{ products: Array<{ id: string; inStock: boolean }> }>;
    };
    const p1Card = brandSection.groups
      .flatMap((group) => group.products)
      .find((product) => product.id === p1);
    expect(p1Card?.inStock).toBe(false);
  });

  it('omits hidden, empty, unpublished, deleted, and ineligible references', async () => {
    cache.clear();
    const res = await request(app.getHttpServer()).get(BASE).expect(200);
    const sections = res.body.sections as Array<Record<string, unknown>>;

    const discovery = sections.find((section) => section.key === 'discovery') as {
      categories: Array<{ id: string }>;
    };
    expect(discovery.categories.map((category) => category.id)).toEqual([categoryId]);

    const spotlight = sections.find((section) => section.key === 'spotlight') as {
      category: { id: string };
      secondaryCount: number | null;
    };
    expect(spotlight.category.id).toBe(categoryId);
    expect(spotlight.secondaryCount).toBeNull();

    const brands = sections.find((section) => section.key === 'brands') as {
      groups: Array<{ brand: { slug: string }; products: Array<{ id: string }> }>;
    };
    expect(brands.groups).toHaveLength(1);
    expect(brands.groups[0]!.brand.slug).toBe(
      (await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })).slug,
    );
    expect(brands.groups[0]!.products.map((product) => product.id)).toEqual([p1, p3]);

    const blog = sections.find((section) => section.key === 'blog') as {
      posts: Array<{ id: string }>;
    };
    expect(blog.posts.map((post) => post.id)).toEqual([publishedPost]);
    expect(JSON.stringify(res.body)).not.toContain(p2);
    expect(JSON.stringify(res.body)).not.toContain(deletedBrandId);
    expect(JSON.stringify(res.body)).not.toContain(draftPost);
  });

  it('drops deleted media while keeping publication snapshots immutable', async () => {
    await prisma.merchMedia.update({
      where: { id: desktopMedia },
      data: { deletedAt: new Date() },
    });
    cache.clear();
    const res = await request(app.getHttpServer()).get(BASE).expect(200);
    const hero = (res.body.sections as Array<Record<string, unknown>>).find(
      (section) => section.key === 'hero',
    ) as { slides: Array<Record<string, unknown>> };
    expect(hero.slides[0]!.desktopImageUrl).toBeNull();
    expect(hero.slides[0]!.mobileImageUrl).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain(desktopMedia);
    const stored = await prisma.homepagePublication.findUniqueOrThrow({
      where: { id: initialPublicationId },
    });
    expect(JSON.stringify(stored.sections)).toContain(desktopMedia);
  });

  it('ignores scheduled and superseded publications and exposes a new version immediately', async () => {
    const scheduled = await createPublication(snapshot, 'SCHEDULED');
    cache.clear();
    const withScheduled = await request(app.getHttpServer()).get(BASE).expect(200);
    expect(withScheduled.body.version).toBe(1);
    expect(withScheduled.body.version).not.toBe(scheduled.version);

    const previousEtag = withScheduled.headers.etag as string;
    const nextSnapshot = buildSnapshot();
    (nextSnapshot.sections[1] as {
      settings: { items: Array<{ icon: string; title: string }> };
    }).settings.items = [{ icon: 'support', title: 'نسخه جدید' }];
    await prisma.homepagePublication.update({
      where: { id: initialPublicationId },
      data: { status: 'SUPERSEDED' },
    });
    const current = await createPublication(nextSnapshot, 'PUBLISHED');
    cache.clear();
    const res = await request(app.getHttpServer()).get(BASE).expect(200);
    expect(res.body.version).toBe(current.version);
    expect(res.body.version).toBeGreaterThan(scheduled.version - 1);
    const trust = (res.body.sections as Array<Record<string, unknown>>).find(
      (section) => section.key === 'trust',
    ) as { items: Array<{ title: string }> };
    expect(trust.items[0]!.title).toBe('نسخه جدید');
    expect(res.headers.etag).toMatch(/^"sha256-[A-Za-z0-9_-]+"$/);
    expect(res.headers.etag).not.toBe(previousEtag);
    const staleConditional = await request(app.getHttpServer())
      .get(BASE)
      .set('If-None-Match', previousEtag)
      .expect(200);
    expect(staleConditional.body.version).toBe(current.version);
    expect(staleConditional.headers.etag).toBe(res.headers.etag);
  });

  it('fails safely and disables caching for a malformed current snapshot', async () => {
    const current = await prisma.homepagePublication.findFirstOrThrow({
      where: { status: 'PUBLISHED' },
    });
    await prisma.homepagePublication.update({
      where: { id: current.id },
      data: { status: 'SUPERSEDED' },
    });
    await createPublication({ schemaVersion: 99, sections: [] }, 'PUBLISHED', 99);
    cache.clear();
    const res = await request(app.getHttpServer()).get(BASE).expect(503);
    expect(res.body).toEqual({
      error: 'HOMEPAGE_UNAVAILABLE',
      message: 'صفحه اصلی در حال حاضر در دسترس نیست.',
    });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(res.body)).not.toContain('schemaVersion');
    expect(JSON.stringify(res.body)).not.toContain('errors');

    const malformed = await prisma.homepagePublication.findFirstOrThrow({
      where: { status: 'PUBLISHED' },
    });
    await prisma.homepagePublication.update({
      where: { id: malformed.id },
      data: { status: 'SUPERSEDED' },
    });
    await createPublication({}, 'PUBLISHED', 1);
    cache.clear();
    const missingSections = await request(app.getHttpServer())
      .get(BASE)
      .expect(503);
    expect(missingSections.body.error).toBe('HOMEPAGE_UNAVAILABLE');
    expect(missingSections.headers['cache-control']).toBe('no-store');
  });
});
