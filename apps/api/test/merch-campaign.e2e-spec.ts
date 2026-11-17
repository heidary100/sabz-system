import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(90_000);

const BASE = '/api/v1/admin/merchandising/campaigns';
const MEDIA_BASE = '/api/v1/admin/merchandising/media';

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

function uniqueToken(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

describe('Merchandising campaign API (Task 05.3) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;

  const mobiles: string[] = [];
  const userIds: string[] = [];
  const roleIds: Record<string, string> = {};
  const campaignIds: string[] = [];
  const productIds: string[] = [];
  const categoryIds: string[] = [];
  const brandIds: string[] = [];
  const mediaIds: string[] = [];
  const publicationIds: string[] = [];
  let versionSeed = 0;

  let adminToken = '';
  let operatorToken = '';
  let customerToken = '';
  let partnerToken = '';
  let adminUserId = '';
  let operatorUserId = '';

  let categoryId = '';
  let secondCategoryId = '';
  let hiddenCategoryId = '';
  let deletedCategoryId = '';
  let brandId = '';
  let secondBrandId = '';
  let deletedBrandId = '';
  let productId = '';
  let secondProductId = '';
  let draftProductId = '';
  let deletedProductId = '';
  let mediaId = '';
  let secondMediaId = '';
  let deletedMediaId = '';

  async function seedRole(name: string): Promise<string> {
    const existing = await prisma.role.findUnique({ where: { name } });
    if (existing) return existing.id;
    try {
      return (await prisma.role.create({ data: { name } })).id;
    } catch {
      return (await prisma.role.findUniqueOrThrow({ where: { name } })).id;
    }
  }

  async function createUser(role: string) {
    const mobile = uniqueMobile();
    mobiles.push(mobile);
    const user = await prisma.user.create({ data: { mobile, status: 'ACTIVE' } });
    userIds.push(user.id);
    await prisma.userRole.create({
      data: { userId: user.id, roleId: roleIds[role]!, assignedBy: user.id },
    });
    await prisma.userProfile.create({
      data: { userId: user.id, firstName: 'علی', lastName: 'احمدی' },
    });
    const tokens = await tokenService.createSession(user.id);
    return { userId: user.id, accessToken: tokens.accessToken };
  }

  async function createCampaign(
    token: string,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post(BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        internalName: uniqueToken('کمپین'),
        type: 'SEASONAL',
        titleFa: uniqueToken('عنوان'),
        ...overrides,
      });
    if (res.status === 201) campaignIds.push(res.body.id);
    return res;
  }

  function campaignBody(overrides: Record<string, unknown> = {}) {
    return {
      internalName: uniqueToken('campaign-e2e'),
      type: 'DISCOUNT',
      titleFa: uniqueToken('تخفیف ویژه'),
      ...overrides,
    };
  }

  function nextVersion(): number {
    if (versionSeed === 0) {
      versionSeed = Math.floor(Date.now() / 1000) % 1_000_000;
    }
    versionSeed += 1;
    return versionSeed;
  }

  async function createPublication(
    campaign: Record<string, unknown>,
    status: 'PUBLISHED' | 'SCHEDULED',
    sectionsOverride?: unknown,
  ) {
    const snapshot = {
      sourceCampaignId: campaign.id,
      type: campaign.type,
      titleFa: campaign.titleFa,
      eyebrowFa: campaign.eyebrowFa,
      subtitleFa: campaign.subtitleFa,
      descriptionFa: campaign.descriptionFa,
      ctaLabelFa: campaign.ctaLabelFa,
      cta: campaign.cta,
      productIds: (campaign.products as Array<{ id: string }>).map((item) => item.id),
      categoryIds: (campaign.categories as Array<{ id: string }>).map((item) => item.id),
      brandIds: (campaign.brands as Array<{ id: string }>).map((item) => item.id),
      media: (campaign.media as Array<Record<string, unknown>>).map((item) => ({
        mediaId: item.mediaId,
        slot: item.slot,
        altFa: item.altFa,
        focalX: item.focalX,
        focalY: item.focalY,
        sortOrder: item.sortOrder,
      })),
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
    };
    const publication = await prisma.homepagePublication.create({
      data: {
        version: nextVersion(),
        status,
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
        publishAt: status === 'SCHEDULED' ? new Date(Date.now() + 3_600_000) : null,
        sections: (sectionsOverride ?? [{ type: 'CAMPAIGN', campaign: snapshot }]) as object,
        sourceDraftRevision: 0,
      },
    });
    publicationIds.push(publication.id);
    return publication;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    tokenService = app.get(TokenService);

    for (const role of ['CUSTOMER', 'PARTNER', 'OPERATOR', 'ADMIN']) {
      roleIds[role] = await seedRole(role);
    }

    // This suite owns publication rows while it runs; removing stale PUBLISHED
    // rows also avoids the single-live-publication unique constraint.
    await prisma.homepagePublication.deleteMany({});

    const admin = await createUser('ADMIN');
    const operator = await createUser('OPERATOR');
    const customer = await createUser('CUSTOMER');
    const partner = await createUser('PARTNER');
    adminToken = admin.accessToken;
    adminUserId = admin.userId;
    operatorToken = operator.accessToken;
    operatorUserId = operator.userId;
    customerToken = customer.accessToken;
    partnerToken = partner.accessToken;

    const category = await prisma.category.create({
      data: { name: uniqueToken('دسته'), slug: uniqueToken('cat') },
    });
    categoryId = category.id;
    categoryIds.push(category.id);
    const secondCategory = await prisma.category.create({
      data: { name: uniqueToken('دسته دوم'), slug: uniqueToken('cat-2') },
    });
    secondCategoryId = secondCategory.id;
    categoryIds.push(secondCategory.id);
    const hiddenCategory = await prisma.category.create({
      data: {
        name: uniqueToken('دسته مخفی'),
        slug: uniqueToken('cat-hidden'),
        isVisible: false,
      },
    });
    hiddenCategoryId = hiddenCategory.id;
    categoryIds.push(hiddenCategory.id);
    const deletedCategory = await prisma.category.create({
      data: {
        name: uniqueToken('دسته حذف‌شده'),
        slug: uniqueToken('cat-deleted'),
        deletedAt: new Date(),
      },
    });
    deletedCategoryId = deletedCategory.id;
    categoryIds.push(deletedCategory.id);

    const brand = await prisma.brand.create({
      data: { name: uniqueToken('برند'), slug: uniqueToken('brand') },
    });
    brandId = brand.id;
    brandIds.push(brand.id);
    const secondBrand = await prisma.brand.create({
      data: { name: uniqueToken('برند دوم'), slug: uniqueToken('brand-2') },
    });
    secondBrandId = secondBrand.id;
    brandIds.push(secondBrand.id);
    const deletedBrand = await prisma.brand.create({
      data: {
        name: uniqueToken('برند حذف‌شده'),
        slug: uniqueToken('brand-deleted'),
        deletedAt: new Date(),
      },
    });
    deletedBrandId = deletedBrand.id;
    brandIds.push(deletedBrand.id);

    const product = await prisma.product.create({
      data: {
        name: uniqueToken('محصول'),
        slug: uniqueToken('product'),
        categoryId,
        brandId,
        condition: 'NEW',
        status: 'PUBLISHED',
      },
    });
    productId = product.id;
    productIds.push(product.id);
    const secondProduct = await prisma.product.create({
      data: {
        name: uniqueToken('محصول دوم'),
        slug: uniqueToken('product-2'),
        categoryId: secondCategoryId,
        brandId: secondBrandId,
        condition: 'NEW',
        status: 'PUBLISHED',
      },
    });
    secondProductId = secondProduct.id;
    productIds.push(secondProduct.id);
    const draftProduct = await prisma.product.create({
      data: {
        name: uniqueToken('پیش‌نویس'),
        slug: uniqueToken('product-draft'),
        categoryId,
        condition: 'NEW',
        status: 'DRAFT',
      },
    });
    draftProductId = draftProduct.id;
    productIds.push(draftProduct.id);
    const deletedProduct = await prisma.product.create({
      data: {
        name: uniqueToken('حذف‌شده'),
        slug: uniqueToken('product-deleted'),
        categoryId,
        condition: 'NEW',
        status: 'PUBLISHED',
        deletedAt: new Date(),
      },
    });
    deletedProductId = deletedProduct.id;
    productIds.push(deletedProduct.id);

    const media = await prisma.merchMedia.create({
      data: {
        originalName: 'hero.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        storageKey: `e2e-merch/${randomUUID()}`,
        width: 1200,
        height: 600,
        altFa: 'تصویر هیرو',
        publishedAt: null,
      },
    });
    mediaId = media.id;
    mediaIds.push(media.id);
    const secondMedia = await prisma.merchMedia.create({
      data: {
        originalName: 'banner.webp',
        mimeType: 'image/webp',
        sizeBytes: 2048,
        storageKey: `e2e-merch/${randomUUID()}`,
        width: 800,
        height: 400,
        publishedAt: null,
      },
    });
    secondMediaId = secondMedia.id;
    mediaIds.push(secondMedia.id);
    const deletedMedia = await prisma.merchMedia.create({
      data: {
        originalName: 'deleted.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 512,
        storageKey: `e2e-merch/${randomUUID()}`,
        deletedAt: new Date(),
      },
    });
    deletedMediaId = deletedMedia.id;
    mediaIds.push(deletedMedia.id);
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS sabz_e2e_fail_campaign_media_trg ON "MerchCampaignMedia"',
    );
    await prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS sabz_e2e_fail_campaign_media()',
    );
    await prisma.homepagePublication.deleteMany({
      where: { id: { in: publicationIds } },
    });
    await prisma.merchCampaign.deleteMany({ where: { id: { in: campaignIds } } });
    await prisma.merchMedia.deleteMany({ where: { id: { in: mediaIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: brandIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: [...campaignIds, ...mediaIds] } },
          { userId: { in: userIds } },
        ],
      },
    });
    await prisma.userSession.deleteMany({
      where: { user: { mobile: { in: mobiles } } },
    });
    await prisma.user.deleteMany({ where: { mobile: { in: mobiles } } });
    await app.close();
  });

  describe('authentication and authorization', () => {
    const id = '00000000-0000-0000-0000-000000000000';

    it('rejects every campaign endpoint without a token', async () => {
      await request(app.getHttpServer()).get(BASE).expect(401);
      await request(app.getHttpServer())
        .post(BASE)
        .send(campaignBody())
        .expect(401);
      await request(app.getHttpServer()).get(`${BASE}/${id}`).expect(401);
      await request(app.getHttpServer())
        .patch(`${BASE}/${id}`)
        .send({ titleFa: 'x' })
        .expect(401);
      await request(app.getHttpServer()).post(`${BASE}/${id}/enable`).expect(401);
      await request(app.getHttpServer()).post(`${BASE}/${id}/disable`).expect(401);
      await request(app.getHttpServer()).post(`${BASE}/${id}/archive`).expect(401);
    });

    it('rejects CUSTOMER and PARTNER roles', async () => {
      for (const token of [customerToken, partnerToken]) {
        await request(app.getHttpServer())
          .get(BASE)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
        await request(app.getHttpServer())
          .post(BASE)
          .set('Authorization', `Bearer ${token}`)
          .send(campaignBody())
          .expect(403);
        await request(app.getHttpServer())
          .post(`${BASE}/${id}/archive`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
      }
    });

    it('allows ADMIN and OPERATOR to list campaigns', async () => {
      for (const token of [adminToken, operatorToken]) {
        await request(app.getHttpServer())
          .get(BASE)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      }
    });
  });

  describe('campaign creation and validation', () => {
    it('creates a campaign with ordered selections and media metadata only', async () => {
      const res = await createCampaign(adminToken, {
        eyebrowFa: 'فرصت محدود',
        subtitleFa: 'زیرعنوان',
        descriptionFa: 'توضیحات کمپین',
        ctaLabelFa: 'مشاهده محصولات',
        cta: { kind: 'PRODUCT', productId },
        startsAt: '2030-01-01T00:00:00.000Z',
        endsAt: '2030-02-01T00:00:00.000Z',
        priority: 5,
        productIds: [secondProductId, productId],
        categoryIds: [secondCategoryId, categoryId],
        brandIds: [secondBrandId, brandId],
        media: [
          {
            mediaId,
            slot: 'HERO_DESKTOP',
            focalX: 25,
            focalY: 70,
            altFa: 'هیرو دسکتاپ',
          },
          {
            mediaId: secondMediaId,
            slot: 'BANNER',
            focalX: 50,
            focalY: 50,
          },
        ],
      });

      expect(res.status).toBe(201);
      expect(res.body.internalName).toContain('کمپین');
      expect(res.body.cta).toEqual({ kind: 'PRODUCT', productId });
      expect(res.body.scheduleStatus).toBe('SCHEDULED');
      expect(res.body.status).toBe('SCHEDULED');
      expect(res.body.isEnabled).toBe(true);
      expect(res.body.isArchived).toBe(false);
      expect(res.body.createdBy).toBe(adminUserId);
      expect(res.body.usage).toEqual({
        currentPublications: [],
        scheduledPublications: [],
      });
      expect(res.body.hasUnpublishedChanges).toBeNull();

      expect(res.body.products.map((item: { id: string }) => item.id)).toEqual([
        secondProductId,
        productId,
      ]);
      expect(res.body.products.map((item: { sortOrder: number }) => item.sortOrder)).toEqual([
        0, 1,
      ]);
      expect(res.body.categories.map((item: { id: string }) => item.id)).toEqual([
        secondCategoryId,
        categoryId,
      ]);
      expect(res.body.brands.map((item: { id: string }) => item.id)).toEqual([
        secondBrandId,
        brandId,
      ]);
      expect(res.body.media[0]).toMatchObject({
        mediaId,
        slot: 'HERO_DESKTOP',
        focalX: 25,
        focalY: 70,
        altFa: 'هیرو دسکتاپ',
        sortOrder: 0,
        publishedAt: null,
      });
      expect(res.body.media[1]).toMatchObject({
        mediaId: secondMediaId,
        slot: 'BANNER',
        sortOrder: 1,
        publishedAt: null,
      });
      expect(JSON.stringify(res.body)).not.toContain('storageKey');
      expect(JSON.stringify(res.body)).not.toContain('e2e-merch/');
    });

    it('allows OPERATOR to create campaign drafts', async () => {
      const res = await createCampaign(operatorToken, {
        type: 'EDITORIAL',
        ctaLabelFa: 'همه محصولات',
        cta: { kind: 'ALL_PRODUCTS' },
      });
      expect(res.status).toBe(201);
      expect(res.body.createdBy).toBe(operatorUserId);
    });

    it('rejects invalid campaign type and unknown fields', async () => {
      const invalidType = await createCampaign(adminToken, { type: 'FLASH_SALE' });
      expect(invalidType.status).toBe(400);

      const unknown = await createCampaign(adminToken, { publishedAt: new Date().toISOString() });
      expect(unknown.status).toBe(400);
      expect(unknown.body.errors).toContainEqual(
        expect.objectContaining({ path: 'campaign.publishedAt', code: 'UNKNOWN_FIELD' }),
      );
    });

    it('rejects malformed and nonexistent CTA targets', async () => {
      const malformed = await createCampaign(adminToken, {
        cta: { kind: 'PRODUCT' },
        ctaLabelFa: 'مشاهده',
      });
      expect(malformed.status).toBe(400);

      const nonexistent = await createCampaign(adminToken, {
        cta: { kind: 'PRODUCT', productId: randomUUID() },
        ctaLabelFa: 'مشاهده',
      });
      expect(nonexistent.status).toBe(400);
      expect(nonexistent.body.error).toBe('MERCH_CAMPAIGN_CTA_TARGET_INVALID');

      const missingLabel = await createCampaign(adminToken, {
        cta: { kind: 'CATEGORY', categoryId },
      });
      expect(missingLabel.status).toBe(400);
      expect(missingLabel.body.error).toBe('MERCH_CAMPAIGN_CTA_LABEL_REQUIRED');
    });

    it('rejects an invalid schedule window', async () => {
      const res = await createCampaign(adminToken, {
        startsAt: '2030-02-01T00:00:00.000Z',
        endsAt: '2030-01-01T00:00:00.000Z',
      });
      expect(res.status).toBe(400);
      expect(res.body.errors).toContainEqual(
        expect.objectContaining({ code: 'INVALID_WINDOW' }),
      );
    });

    it('rejects duplicate IDs, selection limits, and ineligible entities', async () => {
      const duplicate = await createCampaign(adminToken, {
        productIds: [productId, productId],
      });
      expect(duplicate.status).toBe(400);

      const tooMany = await createCampaign(adminToken, {
        productIds: Array.from({ length: 13 }, () => randomUUID()),
      });
      expect(tooMany.status).toBe(400);

      for (const body of [
        { productIds: [draftProductId] },
        { productIds: [deletedProductId] },
        { categoryIds: [hiddenCategoryId] },
        { categoryIds: [deletedCategoryId] },
        { brandIds: [deletedBrandId] },
      ]) {
        const res = await createCampaign(adminToken, body);
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('MERCH_CAMPAIGN_SELECTION_INVALID');
      }
    });
  });

  describe('campaign update and listing', () => {
    it('updates metadata and preserves associations omitted from the patch', async () => {
      const created = await createCampaign(adminToken, {
        productIds: [productId],
        categoryIds: [categoryId],
        brandIds: [brandId],
        media: [{ mediaId, slot: 'HERO_DESKTOP' }],
      });
      const id = created.body.id as string;
      const res = await request(app.getHttpServer())
        .patch(`${BASE}/${id}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          titleFa: 'عنوان به‌روزشده',
          eyebrowFa: null,
          priority: 3,
          ctaLabelFa: 'همه محصولات',
          cta: { kind: 'ALL_PRODUCTS' },
        });

      expect(res.status).toBe(200);
      expect(res.body.titleFa).toBe('عنوان به‌روزشده');
      expect(res.body.eyebrowFa).toBeNull();
      expect(res.body.priority).toBe(3);
      expect(res.body.cta).toEqual({ kind: 'ALL_PRODUCTS' });
      expect(res.body.updatedBy).toBe(operatorUserId);
      expect(res.body.products).toHaveLength(1);
      expect(res.body.categories).toHaveLength(1);
      expect(res.body.brands).toHaveLength(1);
      expect(res.body.media).toHaveLength(1);
    });

    it('rejects empty patches and unknown fields', async () => {
      const created = await createCampaign(adminToken);
      const id = created.body.id as string;
      await request(app.getHttpServer())
        .patch(`${BASE}/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
      const unknown = await request(app.getHttpServer())
        .patch(`${BASE}/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ archivedAt: new Date().toISOString() });
      expect(unknown.status).toBe(400);
    });

    it('replaces selection order atomically and keeps the old set after rejection', async () => {
      const created = await createCampaign(adminToken, {
        productIds: [productId],
        categoryIds: [categoryId],
        brandIds: [brandId],
      });
      const id = created.body.id as string;

      const updated = await request(app.getHttpServer())
        .patch(`${BASE}/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productIds: [secondProductId, productId],
          categoryIds: [secondCategoryId, categoryId],
          brandIds: [secondBrandId, brandId],
        });
      expect(updated.status).toBe(200);
      expect(updated.body.products.map((item: { id: string }) => item.id)).toEqual([
        secondProductId,
        productId,
      ]);
      expect(updated.body.categories.map((item: { id: string }) => item.id)).toEqual([
        secondCategoryId,
        categoryId,
      ]);
      expect(updated.body.brands.map((item: { id: string }) => item.id)).toEqual([
        secondBrandId,
        brandId,
      ]);

      const rejected = await request(app.getHttpServer())
        .patch(`${BASE}/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productIds: [productId],
          categoryIds: [deletedCategoryId],
        });
      expect(rejected.status).toBe(400);

      const after = await request(app.getHttpServer())
        .get(`${BASE}/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(after.body.products.map((item: { id: string }) => item.id)).toEqual([
        secondProductId,
        productId,
      ]);
      expect(after.body.categories.map((item: { id: string }) => item.id)).toEqual([
        secondCategoryId,
        categoryId,
      ]);
    });

    it('rolls back all association writes when a later write fails', async () => {
      const created = await createCampaign(adminToken, {
        titleFa: 'عنوان قبل از خطا',
        productIds: [productId],
        categoryIds: [categoryId],
        brandIds: [brandId],
        media: [{ mediaId, slot: 'HERO_DESKTOP' }],
      });
      const id = created.body.id as string;

      // Force the last association write (media) to fail after products,
      // categories, and brands have already been replaced inside the same
      // transaction. The whole update must roll back.
      await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION sabz_e2e_fail_campaign_media()
        RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'e2e forced campaign media failure';
        END;
        $$ LANGUAGE plpgsql
      `);
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS sabz_e2e_fail_campaign_media_trg ON "MerchCampaignMedia"',
      );
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER sabz_e2e_fail_campaign_media_trg
        BEFORE INSERT ON "MerchCampaignMedia"
        FOR EACH ROW WHEN (NEW."campaignId" = '${id}')
        EXECUTE FUNCTION sabz_e2e_fail_campaign_media()
      `);

      try {
        const failed = await request(app.getHttpServer())
          .patch(`${BASE}/${id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            titleFa: 'عنوانی که باید برگردد',
            productIds: [secondProductId],
            categoryIds: [secondCategoryId],
            brandIds: [secondBrandId],
            media: [{ mediaId: secondMediaId, slot: 'BANNER' }],
          });
        expect(failed.status).toBe(500);
      } finally {
        await prisma.$executeRawUnsafe(
          'DROP TRIGGER IF EXISTS sabz_e2e_fail_campaign_media_trg ON "MerchCampaignMedia"',
        );
        await prisma.$executeRawUnsafe(
          'DROP FUNCTION IF EXISTS sabz_e2e_fail_campaign_media()',
        );
      }

      const detail = await request(app.getHttpServer())
        .get(`${BASE}/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(detail.body.titleFa).toBe('عنوان قبل از خطا');
      expect(detail.body.products.map((item: { id: string }) => item.id)).toEqual([productId]);
      expect(detail.body.categories.map((item: { id: string }) => item.id)).toEqual([
        categoryId,
      ]);
      expect(detail.body.brands.map((item: { id: string }) => item.id)).toEqual([brandId]);
      expect(detail.body.media.map((item: { mediaId: string }) => item.mediaId)).toEqual([
        mediaId,
      ]);
    });

    it('lists with pagination, search, filters, and stable recent ordering', async () => {
      const token = uniqueToken('list-search');
      const first = await createCampaign(adminToken, {
        internalName: `${token}-1`,
        titleFa: `${token}-1`,
        type: 'BRAND',
        isEnabled: true,
      });
      const second = await createCampaign(adminToken, {
        internalName: `${token}-2`,
        titleFa: `${token}-2`,
        type: 'CATEGORY',
        isEnabled: false,
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const third = await createCampaign(adminToken, {
        internalName: `${token}-3`,
        titleFa: `${token}-3`,
        type: 'BRAND',
        isEnabled: true,
      });

      const page = await request(app.getHttpServer())
        .get(BASE)
        .query({ q: token, page: 1, limit: 2 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(page.body.total).toBe(3);
      expect(page.body.items).toHaveLength(2);
      expect(page.body.items[0].id).toBe(third.body.id);

      const page2 = await request(app.getHttpServer())
        .get(BASE)
        .query({ q: token, page: 2, limit: 2 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(page2.body.items).toHaveLength(1);
      expect(page2.body.items[0].id).toBe(first.body.id);

      const brandFilter = await request(app.getHttpServer())
        .get(BASE)
        .query({ q: token, type: 'BRAND' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(brandFilter.body.total).toBe(2);
      expect(brandFilter.body.items.every((item: { type: string }) => item.type === 'BRAND')).toBe(
        true,
      );

      const disabledFilter = await request(app.getHttpServer())
        .get(BASE)
        .query({ q: token, isEnabled: false })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(disabledFilter.body.total).toBe(1);
      expect(disabledFilter.body.items[0].id).toBe(second.body.id);

      await request(app.getHttpServer())
        .get(BASE)
        .query({ limit: 101 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('returns 404 for unknown campaigns', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`${BASE}/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ titleFa: 'x' })
        .expect(404);
    });
  });

  describe('campaign media assignments', () => {
    it('assigns media without publishing it and keeps focal/slot/order data', async () => {
      const created = await createCampaign(adminToken);
      const id = created.body.id as string;

      const res = await request(app.getHttpServer())
        .patch(`${BASE}/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          media: [
            {
              mediaId: secondMediaId,
              slot: 'EDITORIAL',
              focalX: 10,
              focalY: 90,
              altFa: 'متن جایگزین',
            },
            { mediaId, slot: 'HERO_MOBILE' },
          ],
        })
        .expect(200);

      expect(res.body.media.map((item: { mediaId: string }) => item.mediaId)).toEqual([
        secondMediaId,
        mediaId,
      ]);
      expect(res.body.media[0]).toMatchObject({
        slot: 'EDITORIAL',
        focalX: 10,
        focalY: 90,
        altFa: 'متن جایگزین',
        sortOrder: 0,
        publishedAt: null,
      });
      expect(res.body.media[1]).toMatchObject({
        slot: 'HERO_MOBILE',
        focalX: 50,
        focalY: 50,
        sortOrder: 1,
        publishedAt: null,
      });

      const stored = await prisma.merchMedia.findMany({
        where: { id: { in: [mediaId, secondMediaId] } },
        select: { id: true, publishedAt: true },
      });
      expect(stored.every((row) => row.publishedAt === null)).toBe(true);

      await request(app.getHttpServer())
        .get(`/api/v1/catalog/merch-media/${mediaId}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/catalog/merch-media/${mediaId}/thumbnail`)
        .expect(404);
    });

    it('serializes campaign creation against media soft deletion', async () => {
      const media = await prisma.merchMedia.create({
        data: {
          originalName: 'create-race.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 128,
          storageKey: `e2e-merch/${randomUUID()}`,
          publishedAt: null,
        },
      });
      mediaIds.push(media.id);

      const [createRes, deleteRes] = await Promise.all([
        request(app.getHttpServer())
          .post(BASE)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            internalName: uniqueToken('create-race'),
            type: 'EDITORIAL',
            titleFa: uniqueToken('مسابقه ایجاد'),
            media: [{ mediaId: media.id, slot: 'HERO_DESKTOP' }],
          }),
        request(app.getHttpServer())
          .delete(`${MEDIA_BASE}/${media.id}`)
          .set('Authorization', `Bearer ${adminToken}`),
      ]);

      expect([201, 400]).toContain(createRes.status);
      expect([200, 409]).toContain(deleteRes.status);

      if (createRes.status === 201) {
        campaignIds.push(createRes.body.id);
        expect(deleteRes.status).toBe(409);
        const detail = await request(app.getHttpServer())
          .get(`${BASE}/${createRes.body.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
        expect(
          detail.body.media.map((item: { mediaId: string }) => item.mediaId),
        ).toEqual([media.id]);
        const stored = await prisma.merchMedia.findUniqueOrThrow({
          where: { id: media.id },
        });
        expect(stored.deletedAt).toBeNull();
      } else {
        expect(deleteRes.status).toBe(200);
        expect(
          await prisma.merchCampaignMedia.count({
            where: { mediaId: media.id },
          }),
        ).toBe(0);
        const stored = await prisma.merchMedia.findUniqueOrThrow({
          where: { id: media.id },
        });
        expect(stored.deletedAt).not.toBeNull();
      }
    });

    it('rejects missing, deleted, and invalid media assignments', async () => {
      const created = await createCampaign(adminToken);
      const id = created.body.id as string;

      for (const mediaPayload of [
        [{ mediaId: randomUUID(), slot: 'BANNER' }],
        [{ mediaId: deletedMediaId, slot: 'BANNER' }],
        [{ mediaId, slot: 'SIDEBAR' }],
        [{ mediaId, slot: 'BANNER', focalX: 101 }],
        [
          { mediaId, slot: 'BANNER' },
          { mediaId, slot: 'BANNER' },
        ],
      ]) {
        const res = await request(app.getHttpServer())
          .patch(`${BASE}/${id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ media: mediaPayload });
        expect(res.status).toBe(400);
      }

      const detail = await request(app.getHttpServer())
        .get(`${BASE}/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(detail.body.media).toEqual([]);
    });
  });

  describe('campaign lifecycle', () => {
    it('disables and enables without publishing or unpublishing', async () => {
      const created = await createCampaign(adminToken);
      const id = created.body.id as string;

      const disabled = await request(app.getHttpServer())
        .post(`${BASE}/${id}/disable`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);
      expect(disabled.body.isEnabled).toBe(false);
      expect(disabled.body.status).toBe('DISABLED');
      expect(disabled.body.usage.currentPublications).toEqual([]);

      const enabled = await request(app.getHttpServer())
        .post(`${BASE}/${id}/enable`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);
      expect(enabled.body.isEnabled).toBe(true);
      expect(enabled.body.status).toBe('DRAFT');
    });

    it('archives unused campaigns, preserves associations, and blocks later lifecycle writes', async () => {
      const created = await createCampaign(adminToken, {
        productIds: [productId],
        media: [{ mediaId, slot: 'HERO_DESKTOP' }],
      });
      const id = created.body.id as string;

      const archived = await request(app.getHttpServer())
        .post(`${BASE}/${id}/archive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(archived.body.isArchived).toBe(true);
      expect(archived.body.status).toBe('ARCHIVED');
      expect(archived.body.archivedAt).not.toBeNull();
      expect(archived.body.products).toHaveLength(1);
      expect(archived.body.media).toHaveLength(1);

      // Idempotent archive keeps the original timestamp.
      const again = await request(app.getHttpServer())
        .post(`${BASE}/${id}/archive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(again.body.archivedAt).toBe(archived.body.archivedAt);

      await request(app.getHttpServer())
        .post(`${BASE}/${id}/enable`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);
      await request(app.getHttpServer())
        .post(`${BASE}/${id}/disable`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);
      await request(app.getHttpServer())
        .patch(`${BASE}/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ titleFa: 'تلاش برای ویرایش' })
        .expect(409);

      const listed = await request(app.getHttpServer())
        .get(BASE)
        .query({ isArchived: true, limit: 100 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(listed.body.items.some((item: { id: string }) => item.id === id)).toBe(true);
    });

    it('keeps published snapshots immutable while exposing usage and dirty state', async () => {
      const created = await createCampaign(adminToken, {
        titleFa: 'عنوان منبع',
        productIds: [productId],
        categoryIds: [categoryId],
        brandIds: [brandId],
        media: [{ mediaId, slot: 'HERO_DESKTOP', focalX: 40, focalY: 60 }],
        startsAt: '2030-01-01T00:00:00.000Z',
        endsAt: '2030-02-01T00:00:00.000Z',
      });
      const campaign = created.body as Record<string, unknown>;
      const id = campaign.id as string;
      const publication = await createPublication(campaign, 'PUBLISHED');
      const originalSections = publication.sections;

      const detail = await request(app.getHttpServer())
        .get(`${BASE}/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(detail.body.usage.currentPublications).toHaveLength(1);
      expect(detail.body.usage.currentPublications[0].id).toBe(publication.id);
      expect(detail.body.usage.scheduledPublications).toEqual([]);
      expect(detail.body.hasUnpublishedChanges).toBe(false);

      await request(app.getHttpServer())
        .post(`${BASE}/${id}/disable`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      let stored = await prisma.homepagePublication.findUniqueOrThrow({
        where: { id: publication.id },
      });
      expect(stored.sections).toEqual(originalSections);

      const updated = await request(app.getHttpServer())
        .patch(`${BASE}/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          titleFa: 'عنوان ویرایش‌شده',
          media: [{ mediaId, slot: 'BANNER', focalX: 0, focalY: 100 }],
        })
        .expect(200);
      expect(updated.body.usage.currentPublications).toHaveLength(1);
      expect(updated.body.hasUnpublishedChanges).toBe(true);

      stored = await prisma.homepagePublication.findUniqueOrThrow({
        where: { id: publication.id },
      });
      expect(stored.sections).toEqual(originalSections);

      const archive = await request(app.getHttpServer())
        .post(`${BASE}/${id}/archive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);
      expect(archive.body.error).toBe('MERCH_CAMPAIGN_IN_USE');
      expect(archive.body.usage.currentPublications[0].id).toBe(publication.id);

      const stillActive = await prisma.merchCampaign.findUniqueOrThrow({ where: { id } });
      expect(stillActive.archivedAt).toBeNull();

      await prisma.homepagePublication.delete({ where: { id: publication.id } });
      const archived = await request(app.getHttpServer())
        .post(`${BASE}/${id}/archive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(archived.body.status).toBe('ARCHIVED');
    });

    it('blocks archive while a scheduled publication references the campaign', async () => {
      const created = await createCampaign(adminToken);
      const campaign = created.body as Record<string, unknown>;
      const publication = await createPublication(campaign, 'SCHEDULED');

      const detail = await request(app.getHttpServer())
        .get(`${BASE}/${campaign.id as string}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(detail.body.usage.scheduledPublications[0].id).toBe(publication.id);

      const archive = await request(app.getHttpServer())
        .post(`${BASE}/${campaign.id as string}/archive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);
      expect(archive.body.usage.scheduledPublications[0].id).toBe(publication.id);

      await prisma.homepagePublication.delete({ where: { id: publication.id } });
      await request(app.getHttpServer())
        .post(`${BASE}/${campaign.id as string}/archive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('serializes concurrent association updates without mixing order sets', async () => {
      const created = await createCampaign(adminToken, {
        productIds: [productId],
        categoryIds: [categoryId],
      });
      const id = created.body.id as string;

      const [first, second] = await Promise.all([
        request(app.getHttpServer())
          .patch(`${BASE}/${id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ productIds: [secondProductId], titleFa: 'هم‌زمان یک' }),
        request(app.getHttpServer())
          .patch(`${BASE}/${id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ productIds: [productId], titleFa: 'هم‌زمان دو' }),
      ]);
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);

      const detail = await request(app.getHttpServer())
        .get(`${BASE}/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const ids = detail.body.products.map((item: { id: string }) => item.id);
      expect(ids).toHaveLength(1);
      expect([productId, secondProductId]).toContain(ids[0]);
      expect(['هم‌زمان یک', 'هم‌زمان دو']).toContain(detail.body.titleFa);
    });
  });

  describe('audit trail', () => {
    it('records create, update, selection/media, and lifecycle operations', async () => {
      const created = await createCampaign(adminToken, {
        productIds: [productId],
        media: [{ mediaId, slot: 'HERO_DESKTOP' }],
      });
      const id = created.body.id as string;
      await request(app.getHttpServer())
        .patch(`${BASE}/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          titleFa: 'ممیزی',
          productIds: [secondProductId],
          media: [{ mediaId: secondMediaId, slot: 'BANNER' }],
        })
        .expect(200);
      await request(app.getHttpServer())
        .post(`${BASE}/${id}/disable`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`${BASE}/${id}/enable`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`${BASE}/${id}/archive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const rows = await prisma.auditLog.findMany({ where: { entityId: id } });
      const actions = rows.map((row) => row.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'MERCH_CAMPAIGN_CREATED',
          'MERCH_CAMPAIGN_UPDATED',
          'MERCH_CAMPAIGN_SELECTIONS_UPDATED',
          'MERCH_CAMPAIGN_MEDIA_UPDATED',
          'MERCH_CAMPAIGN_DISABLED',
          'MERCH_CAMPAIGN_ENABLED',
          'MERCH_CAMPAIGN_ARCHIVED',
        ]),
      );
      expect(JSON.stringify(rows.map((row) => row.after))).not.toContain('storageKey');
    });
  });
});
