import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { HomepagePublicationService } from '../src/modules/merchandising/homepage/homepage-publication.service';

jest.setTimeout(120_000);

const DRAFT_BASE = '/api/v1/admin/merchandising/homepage/draft';
const PUBLICATION_BASE = '/api/v1/admin/merchandising/homepage/publications';
const CAMPAIGN_BASE = '/api/v1/admin/merchandising/campaigns';
const MEDIA_BASE = '/api/v1/admin/merchandising/media';

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

function uniqueToken(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

describe('Homepage draft and publication API (Task 05.4) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;
  let publications: HomepagePublicationService;

  const mobiles: string[] = [];
  const userIds: string[] = [];
  const roleIds: Record<string, string> = {};
  const campaignIds: string[] = [];
  const productIds: string[] = [];
  const categoryIds: string[] = [];
  const brandIds: string[] = [];
  const mediaIds: string[] = [];
  const blogPostIds: string[] = [];
  const publicationIds: string[] = [];

  let adminToken = '';
  let adminUserId = '';
  let operatorToken = '';
  let customerToken = '';
  let partnerToken = '';

  let categoryId = '';
  let secondCategoryId = '';
  let brandId = '';
  let productId = '';
  let secondProductId = '';
  let heroDesktopMediaId = '';
  let heroMobileMediaId = '';
  let otherMediaId = '';
  let heroCampaignId = '';
  let discoveryCampaignId = '';
  let warningCampaignId = '';
  let disabledCampaignId = '';
  let archivedCampaignId = '';
  let expiredCampaignId = '';
  let publishedPostId = '';
  let draftPostId = '';

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
    overrides: Record<string, unknown> = {},
    token = adminToken,
  ) {
    const res = await request(app.getHttpServer())
      .post(CAMPAIGN_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send({
        internalName: uniqueToken('homepage-campaign'),
        type: 'SEASONAL',
        titleFa: uniqueToken('عنوان کمپین'),
        ctaLabelFa: null,
        cta: { kind: 'NONE' },
        ...overrides,
      });
    if (res.status !== 201) {
      throw new Error(`campaign seed failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    campaignIds.push(res.body.id);
    return res.body as Record<string, unknown> & { id: string };
  }

  function baseSections(): Array<Record<string, unknown>> {
    return [
      {
        key: 'hero',
        type: 'HERO_CAROUSEL',
        order: 0,
        isVisible: true,
        settings: { campaignIds: [heroCampaignId] },
      },
      {
        key: 'trust',
        type: 'TRUST_STRIP',
        order: 1,
        isVisible: true,
        settings: {
          items: [
            { icon: 'shield', title: 'ضمانت اصالت', body: 'تضمین کیفیت' },
            { icon: 'truck', title: 'ارسال سریع' },
          ],
        },
      },
      {
        key: 'discovery',
        type: 'CATEGORY_DISCOVERY',
        order: 2,
        isVisible: true,
        settings: { campaignId: discoveryCampaignId },
      },
      {
        key: 'offer',
        type: 'OFFER_STRIP',
        order: 3,
        isVisible: true,
        settings: { campaignId: discoveryCampaignId, fallback: 'featured' },
      },
      {
        key: 'spotlight',
        type: 'CATEGORY_SPOTLIGHT',
        order: 4,
        isVisible: true,
        settings: {
          campaignId: discoveryCampaignId,
          categoryId,
          secondaryCategoryId: secondCategoryId,
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
          title: 'جدیدترین محصولات',
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
        settings: { campaignId: heroCampaignId, productsPerBrand: 3 },
      },
      {
        key: 'blog',
        type: 'BLOG_FEATURE',
        order: 8,
        isVisible: true,
        settings: { source: 'manual', postIds: [publishedPostId] },
      },
    ];
  }

  function withHeroCampaign(
    campaignId: string,
    sections = baseSections(),
  ): Array<Record<string, unknown>> {
    return sections.map((section) =>
      section.key === 'hero'
        ? {
            ...section,
            settings: { campaignIds: [campaignId] },
          }
        : section,
    );
  }

  async function readDraft() {
    const res = await request(app.getHttpServer())
      .get(DRAFT_BASE)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    return res.body as {
      revision: number;
      schemaVersion: number;
      sections: Array<Record<string, unknown>>;
    };
  }

  async function putDraft(
    sections: Array<Record<string, unknown>>,
    revision?: number,
  ) {
    const current = revision === undefined ? await readDraft() : null;
    return request(app.getHttpServer())
      .put(DRAFT_BASE)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        revision: revision ?? current!.revision,
        schemaVersion: 1,
        sections,
      });
  }

  async function publish(body: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post(PUBLICATION_BASE)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
    if (res.status === 201) publicationIds.push(res.body.id);
    return res;
  }

  async function publicationRows() {
    return prisma.homepagePublication.findMany({
      where: { id: { in: publicationIds } },
      orderBy: { version: 'asc' },
    });
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
    publications = app.get(HomepagePublicationService);

    for (const role of ['CUSTOMER', 'PARTNER', 'OPERATOR', 'ADMIN']) {
      roleIds[role] = await seedRole(role);
    }

    await prisma.homepagePublication.deleteMany({});
    await prisma.homepageDraft.deleteMany({});

    const admin = await createUser('ADMIN');
    const operator = await createUser('OPERATOR');
    const customer = await createUser('CUSTOMER');
    const partner = await createUser('PARTNER');
    adminToken = admin.accessToken;
    adminUserId = admin.userId;
    operatorToken = operator.accessToken;
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
    const brand = await prisma.brand.create({
      data: { name: uniqueToken('برند'), slug: uniqueToken('brand') },
    });
    brandId = brand.id;
    brandIds.push(brand.id);
    const firstProduct = await prisma.product.create({
      data: {
        name: uniqueToken('محصول'),
        slug: uniqueToken('product'),
        categoryId,
        brandId,
        condition: 'NEW',
        status: 'PUBLISHED',
      },
    });
    productId = firstProduct.id;
    productIds.push(firstProduct.id);
    const secondProduct = await prisma.product.create({
      data: {
        name: uniqueToken('محصول دوم'),
        slug: uniqueToken('product-2'),
        categoryId,
        brandId,
        condition: 'NEW',
        status: 'PUBLISHED',
      },
    });
    secondProductId = secondProduct.id;
    productIds.push(secondProduct.id);
    await prisma.productVariant.create({
      data: {
        productId: firstProduct.id,
        sku: uniqueToken('SKU'),
        price: '123456.00',
      },
    });

    const desktop = await prisma.merchMedia.create({
      data: {
        originalName: 'hero-desktop.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        storageKey: `homepage-e2e/${randomUUID()}`,
        width: 1600,
        height: 700,
        altFa: 'هیرو دسکتاپ',
        publishedAt: null,
      },
    });
    heroDesktopMediaId = desktop.id;
    mediaIds.push(desktop.id);
    const mobile = await prisma.merchMedia.create({
      data: {
        originalName: 'hero-mobile.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 512,
        storageKey: `homepage-e2e/${randomUUID()}`,
        width: 800,
        height: 900,
        altFa: 'هیرو موبایل',
        publishedAt: null,
      },
    });
    heroMobileMediaId = mobile.id;
    mediaIds.push(mobile.id);
    const other = await prisma.merchMedia.create({
      data: {
        originalName: 'other.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 256,
        storageKey: `homepage-e2e/${randomUUID()}`,
        width: 1200,
        height: 600,
        publishedAt: null,
      },
    });
    otherMediaId = other.id;
    mediaIds.push(other.id);

    const publishedPost = await prisma.blogPost.create({
      data: {
        slug: uniqueToken('post'),
        title: uniqueToken('مقاله'),
        content: '<p>محتوا</p>',
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    publishedPostId = publishedPost.id;
    blogPostIds.push(publishedPost.id);
    const draftPost = await prisma.blogPost.create({
      data: {
        slug: uniqueToken('post-draft'),
        title: uniqueToken('مقاله پیش‌نویس'),
        content: '<p>محتوا</p>',
        status: 'DRAFT',
      },
    });
    draftPostId = draftPost.id;
    blogPostIds.push(draftPost.id);

    const hero = await createCampaign({
      type: 'SEASONAL',
      productIds: [productId, secondProductId],
      categoryIds: [categoryId],
      brandIds: [brandId],
      media: [
        {
          mediaId: heroDesktopMediaId,
          slot: 'HERO_DESKTOP',
          focalX: 20,
          focalY: 70,
          altFa: 'هیرو کمپین',
        },
        {
          mediaId: heroMobileMediaId,
          slot: 'HERO_MOBILE',
          focalX: 50,
          focalY: 50,
        },
      ],
    });
    heroCampaignId = hero.id;
    const discovery = await createCampaign({
      type: 'CATEGORY',
      categoryIds: [categoryId, secondCategoryId],
    });
    discoveryCampaignId = discovery.id;
    const warning = await createCampaign({
      type: 'EDITORIAL',
      media: [{ mediaId: heroDesktopMediaId, slot: 'HERO_DESKTOP' }],
    });
    warningCampaignId = warning.id;
    const disabled = await createCampaign({ isEnabled: false });
    disabledCampaignId = disabled.id;
    const archived = await createCampaign();
    archivedCampaignId = archived.id;
    await request(app.getHttpServer())
      .post(`${CAMPAIGN_BASE}/${archivedCampaignId}/archive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const expired = await createCampaign({
      startsAt: '2020-01-01T00:00:00.000Z',
      endsAt: '2020-02-01T00:00:00.000Z',
    });
    expiredCampaignId = expired.id;
  });

  afterAll(async () => {
    await prisma.homepagePublication.deleteMany({
      where: { id: { in: publicationIds } },
    });
    await prisma.homepageDraft.deleteMany({ where: { id: 'homepage' } });
    await prisma.merchCampaign.deleteMany({ where: { id: { in: campaignIds } } });
    await prisma.merchMedia.deleteMany({ where: { id: { in: mediaIds } } });
    await prisma.productVariant.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.blogPost.deleteMany({ where: { id: { in: blogPostIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: brandIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: [...campaignIds, ...mediaIds, ...publicationIds, 'homepage'] } },
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

  describe('authorization', () => {
    const id = '00000000-0000-0000-0000-000000000000';

    it('rejects unauthenticated draft and publication requests', async () => {
      await request(app.getHttpServer()).get(DRAFT_BASE).expect(401);
      await request(app.getHttpServer()).put(DRAFT_BASE).send({}).expect(401);
      await request(app.getHttpServer()).post(`${DRAFT_BASE}/validate`).send({}).expect(401);
      await request(app.getHttpServer()).get(PUBLICATION_BASE).expect(401);
      await request(app.getHttpServer()).get(`${PUBLICATION_BASE}/${id}`).expect(401);
      await request(app.getHttpServer()).post(PUBLICATION_BASE).send({}).expect(401);
      await request(app.getHttpServer()).post(`${PUBLICATION_BASE}/${id}/cancel`).expect(401);
      await request(app.getHttpServer())
        .post(`${PUBLICATION_BASE}/${id}/rollback`)
        .send({})
        .expect(401);
    });

    it('rejects CUSTOMER and PARTNER roles', async () => {
      for (const token of [customerToken, partnerToken]) {
        await request(app.getHttpServer())
          .get(DRAFT_BASE)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
        await request(app.getHttpServer())
          .get(PUBLICATION_BASE)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
      }
    });

    it('allows OPERATOR to read drafts/history but not publish', async () => {
      await request(app.getHttpServer())
        .get(PUBLICATION_BASE)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(PUBLICATION_BASE)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({})
        .expect(403);
    });
  });

  describe('homepage draft', () => {
    it('initializes the singleton exactly once under concurrent first access', async () => {
      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app.getHttpServer())
            .get(DRAFT_BASE)
            .set('Authorization', `Bearer ${adminToken}`),
        ),
      );
      for (const response of responses) {
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          revision: 0,
          schemaVersion: 1,
          sections: [],
        });
      }
      const count = await prisma.homepageDraft.count({ where: { id: 'homepage' } });
      expect(count).toBe(1);
      const createdAudits = await prisma.auditLog.count({
        where: { action: 'HOMEPAGE_DRAFT_CREATED', entityId: 'homepage' },
      });
      expect(createdAudits).toBe(1);
    });

    it('allows OPERATOR to update a draft and increments revision', async () => {
      const current = await readDraft();
      const res = await request(app.getHttpServer())
        .put(DRAFT_BASE)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ revision: current.revision, schemaVersion: 1, sections: baseSections() })
        .expect(200);
      expect(res.body.revision).toBe(current.revision + 1);
      expect(res.body.sections.map((section: { key: string }) => section.key)).toEqual([
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
    });

    it('rejects a stale revision with current revision information', async () => {
      const current = await readDraft();
      const first = await putDraft(baseSections(), current.revision);
      expect(first.status).toBe(200);
      const stale = await putDraft(baseSections(), current.revision);
      expect(stale.status).toBe(409);
      expect(stale.body).toMatchObject({
        error: 'HOMEPAGE_DRAFT_REVISION_CONFLICT',
        currentRevision: current.revision + 1,
      });
    });

    it('rejects unknown top-level fields', async () => {
      const current = await readDraft();
      const res = await request(app.getHttpServer())
        .put(DRAFT_BASE)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          revision: current.revision,
          sections: baseSections(),
          publishedAt: new Date().toISOString(),
        });
      expect(res.status).toBe(400);
      expect(res.body.errors).toContainEqual(
        expect.objectContaining({ path: 'draft.publishedAt', code: 'UNKNOWN_FIELD' }),
      );
    });

    it('rejects non-normalized ordering and invalid section settings', async () => {
      const current = await readDraft();
      const wrongOrder = baseSections();
      wrongOrder[1] = { ...wrongOrder[1], order: 8 };
      const orderRes = await putDraft(wrongOrder, current.revision);
      expect(orderRes.status).toBe(400);
      expect(orderRes.body.errors).toContainEqual(
        expect.objectContaining({ code: 'NON_NORMALIZED_ORDER' }),
      );

      const badSettings = baseSections();
      badSettings[1] = {
        ...badSettings[1],
        settings: { items: [{ icon: 'unknown', title: 'x' }] },
      };
      const settingsRes = await putDraft(badSettings, current.revision);
      expect(settingsRes.status).toBe(400);
      expect(settingsRes.body.errors).toContainEqual(
        expect.objectContaining({ code: 'INVALID_TRUST_ICON' }),
      );
    });

    it('rejects missing, disabled, archived, and expired campaigns', async () => {
      const current = await readDraft();
      const cases: Array<[string, string]> = [
        [randomUUID(), 'MISSING_CAMPAIGN'],
        [disabledCampaignId, 'CAMPAIGN_DISABLED'],
        [archivedCampaignId, 'CAMPAIGN_ARCHIVED'],
        [expiredCampaignId, 'CAMPAIGN_EXPIRED'],
      ];
      for (const [campaignId, code] of cases) {
        const res = await putDraft(withHeroCampaign(campaignId), current.revision);
        expect(res.status).toBe(400);
        expect(res.body.errors).toContainEqual(expect.objectContaining({ code }));
      }
    });

    it('rejects unpublished blog references', async () => {
      const current = await readDraft();
      const sections = baseSections();
      sections[8] = {
        ...sections[8],
        settings: { source: 'manual', postIds: [draftPostId] },
      };
      const res = await putDraft(sections, current.revision);
      expect(res.status).toBe(400);
      expect(res.body.errors).toContainEqual(
        expect.objectContaining({ code: 'BLOG_POST_NOT_PUBLISHED' }),
      );
    });

    it('validates current source eligibility without persisting', async () => {
      await prisma.product.update({
        where: { id: secondProductId },
        data: { status: 'DRAFT' },
      });
      try {
        const res = await request(app.getHttpServer())
          .post(`${DRAFT_BASE}/validate`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({})
          .expect(200);
        expect(res.body.valid).toBe(false);
        expect(res.body.errors).toContainEqual(
          expect.objectContaining({ code: 'PRODUCT_INELIGIBLE' }),
        );
      } finally {
        await prisma.product.update({
          where: { id: secondProductId },
          data: { status: 'PUBLISHED' },
        });
      }
    });

    it('validates campaign media and category source eligibility', async () => {
      await prisma.merchMedia.update({
        where: { id: heroDesktopMediaId },
        data: { deletedAt: new Date() },
      });
      try {
        const mediaRes = await request(app.getHttpServer())
          .post(`${DRAFT_BASE}/validate`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({})
          .expect(200);
        expect(mediaRes.body.valid).toBe(false);
        expect(mediaRes.body.errors).toContainEqual(
          expect.objectContaining({ code: 'MEDIA_INELIGIBLE' }),
        );
      } finally {
        await prisma.merchMedia.update({
          where: { id: heroDesktopMediaId },
          data: { deletedAt: null },
        });
      }

      await prisma.category.update({
        where: { id: secondCategoryId },
        data: { isVisible: false },
      });
      try {
        const categoryRes = await request(app.getHttpServer())
          .post(`${DRAFT_BASE}/validate`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({})
          .expect(200);
        expect(categoryRes.body.valid).toBe(false);
        expect(categoryRes.body.errors).toContainEqual(
          expect.objectContaining({ code: 'CATEGORY_INELIGIBLE' }),
        );
      } finally {
        await prisma.category.update({
          where: { id: secondCategoryId },
          data: { isVisible: true },
        });
      }
    });

    it('returns warnings without hiding publication blockers', async () => {
      const res = await request(app.getHttpServer())
        .post(`${DRAFT_BASE}/validate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sections: withHeroCampaign(warningCampaignId) })
        .expect(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.warnings).toContainEqual(
        expect.objectContaining({ code: 'HERO_MOBILE_MEDIA_MISSING' }),
      );
    });

    it('records draft creation and update audits', async () => {
      const rows = await prisma.auditLog.findMany({
        where: { entity: 'HomepageDraft', entityId: 'homepage' },
      });
      expect(rows.map((row) => row.action)).toEqual(
        expect.arrayContaining([
          'HOMEPAGE_DRAFT_CREATED',
          'HOMEPAGE_DRAFT_UPDATED',
          'HOMEPAGE_DRAFT_VALIDATION_FAILED',
        ]),
      );
    });

    it('restores the canonical draft before publication tests', async () => {
      const current = await readDraft();
      const res = await putDraft(baseSections(), current.revision);
      expect(res.status).toBe(200);
    });
  });

  describe('homepage publications', () => {
    let scheduledPublicationId = '';
    let firstPublishedId = '';
    let firstPublishedSnapshot: unknown;
    let rollbackTargetId = '';
    let rollbackTargetSections: unknown;

    it('rejects invalid or past scheduled timestamps', async () => {
      const past = await publish({ publishAt: '2020-01-01T00:00:00.000Z' });
      expect(past.status).toBe(400);
      const malformed = await publish({ publishAt: 'tomorrow' });
      expect(malformed.status).toBe(400);
      const unknown = await publish({ mode: 'NOW' });
      expect(unknown.status).toBe(400);
    });

    it('rejects immediate publication of a not-yet-started campaign', async () => {
      const future = await createCampaign({
        startsAt: new Date(Date.now() + 3_600_000).toISOString(),
        endsAt: new Date(Date.now() + 7_200_000).toISOString(),
        media: [{ mediaId: heroDesktopMediaId, slot: 'HERO_DESKTOP' }],
      });
      const validation = await request(app.getHttpServer())
        .post(`${DRAFT_BASE}/validate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sections: withHeroCampaign(future.id) })
        .expect(200);
      expect(validation.body.valid).toBe(true);
      expect(validation.body.errors).toEqual([]);
      expect(validation.body.warnings).toContainEqual(
        expect.objectContaining({ code: 'CAMPAIGN_NOT_STARTED' }),
      );

      const draft = await readDraft();
      const saved = await putDraft(withHeroCampaign(future.id), draft.revision);
      expect(saved.status).toBe(200);

      const rejected = await publish({ note: 'should not publish' });
      expect(rejected.status).toBe(400);
      expect(rejected.body.error).toBe('HOMEPAGE_DRAFT_INVALID');
      expect(rejected.body.errors).toContainEqual(
        expect.objectContaining({ code: 'CAMPAIGN_NOT_STARTED' }),
      );

      const current = await readDraft();
      await putDraft(baseSections(), current.revision).then((res) =>
        expect(res.status).toBe(200),
      );
    });

    it('creates a scheduled snapshot without publishing media', async () => {
      const current = await readDraft();
      const res = await publish({
        publishAt: new Date(Date.now() + 3_600_000).toISOString(),
        note: 'انتشار آزمایشی',
      });
      expect(res.status).toBe(201);
      scheduledPublicationId = res.body.id;
      expect(res.body).toMatchObject({
        status: 'SCHEDULED',
        publishedAt: null,
        sourceDraftRevision: current.revision,
        schemaVersion: 1,
        rollbackFromPublicationId: null,
      });
      expect(res.body.sections).toHaveLength(baseSections().length);
      const media = await prisma.merchMedia.findMany({
        where: { id: { in: [heroDesktopMediaId, heroMobileMediaId, otherMediaId] } },
      });
      expect(media.every((row) => row.publishedAt === null)).toBe(true);

      const detail = await request(app.getHttpServer())
        .get(`${PUBLICATION_BASE}/${scheduledPublicationId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);
      firstPublishedSnapshot = detail.body.sections;
    });

    it('keeps scheduled snapshots immutable after campaign and draft edits', async () => {
      const campaign = await prisma.merchCampaign.findUniqueOrThrow({
        where: { id: heroCampaignId },
      });
      await request(app.getHttpServer())
        .patch(`${CAMPAIGN_BASE}/${heroCampaignId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ titleFa: 'عنوان ویرایش‌شده بعد از زمان‌بندی' })
        .expect(200);

      const current = await readDraft();
      const sections = baseSections();
      sections[1] = {
        ...sections[1],
        settings: { items: [{ icon: 'badge', title: 'تغییر بعد از زمان‌بندی' }] },
      };
      await putDraft(sections, current.revision).then((res) => expect(res.status).toBe(200));

      const detail = await request(app.getHttpServer())
        .get(`${PUBLICATION_BASE}/${scheduledPublicationId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(detail.body.sections).toEqual(firstPublishedSnapshot);
      const hero = (detail.body.sections as Array<Record<string, unknown>>).find(
        (section) => section.key === 'hero',
      ) as {
        settings: { campaigns: Array<{ titleFa: string }> };
      };
      expect(hero.settings.campaigns[0]!.titleFa).toBe(campaign.titleFa);
    });

    it('cancels a scheduled publication idempotently without media effects', async () => {
      const cancelled = await request(app.getHttpServer())
        .post(`${PUBLICATION_BASE}/${scheduledPublicationId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(cancelled.body.status).toBe('CANCELLED');
      const again = await request(app.getHttpServer())
        .post(`${PUBLICATION_BASE}/${scheduledPublicationId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(again.body.status).toBe('CANCELLED');
      const media = await prisma.merchMedia.findMany({
        where: { id: { in: [heroDesktopMediaId, heroMobileMediaId, otherMediaId] } },
      });
      expect(media.every((row) => row.publishedAt === null)).toBe(true);
    });

    it('publishes immediately, freezes presentation data, and activates media', async () => {
      const current = await readDraft();
      const res = await publish({ note: 'انتشار فوری' });
      expect(res.status).toBe(201);
      firstPublishedId = res.body.id;
      expect(res.body).toMatchObject({
        status: 'PUBLISHED',
        sourceDraftRevision: current.revision,
        schemaVersion: 1,
        rollbackFromPublicationId: null,
      });
      expect(res.body.publishedAt).not.toBeNull();
      expect(res.body.sections).toHaveLength(baseSections().length);

      const hero = (res.body.sections as Array<Record<string, unknown>>).find(
        (section) => section.key === 'hero',
      ) as {
        settings: {
          campaigns: Array<{
            productIds: string[];
            media: Array<{ mediaId: string; slot: string; altFa: string; focalX: number }>;
          }>;
        };
      };
      expect(hero.settings.campaigns[0]!.productIds).toEqual([productId, secondProductId]);
      expect(hero.settings.campaigns[0]!.media).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            mediaId: heroDesktopMediaId,
            slot: 'HERO_DESKTOP',
            altFa: 'هیرو کمپین',
            focalX: 20,
            focalY: 70,
          }),
          expect.objectContaining({
            mediaId: heroMobileMediaId,
            slot: 'HERO_MOBILE',
          }),
        ]),
      );
      expect(JSON.stringify(res.body)).not.toContain('123456');
      expect(JSON.stringify(res.body)).not.toContain('storageKey');

      const media = await prisma.merchMedia.findMany({
        where: { id: { in: [heroDesktopMediaId, heroMobileMediaId, otherMediaId] } },
      });
      const byId = new Map(media.map((row) => [row.id, row]));
      expect(byId.get(heroDesktopMediaId)?.publishedAt).not.toBeNull();
      expect(byId.get(heroMobileMediaId)?.publishedAt).not.toBeNull();
      expect(byId.get(otherMediaId)?.publishedAt).toBeNull();

      await request(app.getHttpServer())
        .post(`${CAMPAIGN_BASE}/${heroCampaignId}/archive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);
    });

    it('does not mutate a publication when the draft changes afterwards', async () => {
      const before = await request(app.getHttpServer())
        .get(`${PUBLICATION_BASE}/${firstPublishedId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const current = await readDraft();
      const sections = baseSections();
      sections[1] = {
        ...sections[1],
        settings: { items: [{ icon: 'support', title: 'تغییر بعد از انتشار' }] },
      };
      await putDraft(sections, current.revision).then((res) => expect(res.status).toBe(200));
      const after = await request(app.getHttpServer())
        .get(`${PUBLICATION_BASE}/${firstPublishedId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(after.body.sections).toEqual(before.body.sections);
    });

    it('supersedes the current publication and recomputes media eligibility', async () => {
      await request(app.getHttpServer())
        .patch(`${CAMPAIGN_BASE}/${heroCampaignId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ media: [{ mediaId: otherMediaId, slot: 'HERO_DESKTOP' }] })
        .expect(200);
      const previous = await prisma.homepagePublication.findUniqueOrThrow({
        where: { id: firstPublishedId },
      });
      const res = await publish({ note: 'انتشار دوم' });
      expect(res.status).toBe(201);
      expect(res.body.version).toBeGreaterThan(previous.version);
      const old = await prisma.homepagePublication.findUniqueOrThrow({
        where: { id: firstPublishedId },
      });
      expect(old.status).toBe('SUPERSEDED');

      const media = await prisma.merchMedia.findMany({
        where: { id: { in: [heroDesktopMediaId, heroMobileMediaId, otherMediaId] } },
      });
      const byId = new Map(media.map((row) => [row.id, row]));
      expect(byId.get(otherMediaId)?.publishedAt).not.toBeNull();
      expect(byId.get(heroDesktopMediaId)?.publishedAt).toBeNull();
      expect(byId.get(heroMobileMediaId)?.publishedAt).toBeNull();

      rollbackTargetId = firstPublishedId;
      const target = await request(app.getHttpServer())
        .get(`${PUBLICATION_BASE}/${rollbackTargetId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      rollbackTargetSections = target.body.sections;
    });

    it('lists history with deterministic version ordering and filters', async () => {
      const list = await request(app.getHttpServer())
        .get(PUBLICATION_BASE)
        .query({ limit: 100 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const versions = list.body.items.map((item: { version: number }) => item.version);
      expect(versions).toEqual([...versions].sort((a, b) => b - a));
      expect(list.body.items.some((item: { id: string }) => item.id === firstPublishedId)).toBe(
        true,
      );

      const superseded = await request(app.getHttpServer())
        .get(PUBLICATION_BASE)
        .query({ status: 'SUPERSEDED', limit: 100 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(
        superseded.body.items.every(
          (item: { status: string }) => item.status === 'SUPERSEDED',
        ),
      ).toBe(true);
    });

    it('enforces one current publication under concurrent publish attempts', async () => {
      const [first, second] = await Promise.all([publish(), publish()]);
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      const rows = await publicationRows();
      const published = rows.filter((row) => row.status === 'PUBLISHED');
      expect(published).toHaveLength(1);
      expect(new Set(rows.map((row) => row.version)).size).toBe(rows.length);
      expect([first.body.id, second.body.id]).toContain(published[0]!.id);
    });

    it('rolls back to an earlier immutable snapshot as a new version', async () => {
      const beforeTarget = await prisma.homepagePublication.findUniqueOrThrow({
        where: { id: rollbackTargetId },
      });
      const current = await prisma.homepagePublication.findFirstOrThrow({
        where: { status: 'PUBLISHED' },
      });
      const res = await request(app.getHttpServer())
        .post(`${PUBLICATION_BASE}/${rollbackTargetId}/rollback`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ note: 'بازگردانی آزمایشی' })
        .expect(200);
      expect(res.body.status).toBe('PUBLISHED');
      expect(res.body.rollbackFromPublicationId).toBe(rollbackTargetId);
      expect(res.body.version).toBeGreaterThan(current.version);
      expect(res.body.sections).toEqual(rollbackTargetSections);
      publicationIds.push(res.body.id);

      const targetAfter = await prisma.homepagePublication.findUniqueOrThrow({
        where: { id: rollbackTargetId },
      });
      expect(targetAfter.sections).toEqual(beforeTarget.sections);
      expect(targetAfter.status).toBe('SUPERSEDED');
      const supersededCurrent = await prisma.homepagePublication.findUniqueOrThrow({
        where: { id: current.id },
      });
      expect(supersededCurrent.status).toBe('SUPERSEDED');

      const media = await prisma.merchMedia.findMany({
        where: { id: { in: [heroDesktopMediaId, heroMobileMediaId, otherMediaId] } },
      });
      const byId = new Map(media.map((row) => [row.id, row]));
      expect(byId.get(heroDesktopMediaId)?.publishedAt).not.toBeNull();
      expect(byId.get(heroMobileMediaId)?.publishedAt).not.toBeNull();
      expect(byId.get(otherMediaId)?.publishedAt).toBeNull();
    });

    it('rejects rollback to the current publication and invalid statuses', async () => {
      const current = await prisma.homepagePublication.findFirstOrThrow({
        where: { status: 'PUBLISHED' },
      });
      const currentRes = await request(app.getHttpServer())
        .post(`${PUBLICATION_BASE}/${current.id}/rollback`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(409);
      expect(currentRes.body.error).toBe('HOMEPAGE_ROLLBACK_TARGET_CURRENT');
      const failureAudit = await prisma.auditLog.findFirst({
        where: {
          action: 'HOMEPAGE_ROLLBACK_FAILED',
          entity: 'HomepagePublication',
          entityId: current.id,
          userId: adminUserId,
        },
      });
      expect(failureAudit).not.toBeNull();

      const scheduled = await prisma.homepagePublication.findFirstOrThrow({
        where: { status: 'CANCELLED' },
      });
      const scheduledRes = await request(app.getHttpServer())
        .post(`${PUBLICATION_BASE}/${scheduled.id}/rollback`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(409);
      expect(scheduledRes.body.error).toBe('HOMEPAGE_ROLLBACK_TARGET_INVALID');

      await request(app.getHttpServer())
        .post(`${PUBLICATION_BASE}/${randomUUID()}/rollback`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(404);
    });

    it('rejects rollback when historical media is no longer available', async () => {
      const media = await prisma.merchMedia.create({
        data: {
          originalName: 'rollback-only.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 128,
          storageKey: `homepage-e2e/${randomUUID()}`,
          publishedAt: null,
        },
      });
      mediaIds.push(media.id);
      const campaign = await createCampaign({
        type: 'EDITORIAL',
        media: [{ mediaId: media.id, slot: 'HERO_DESKTOP' }],
      });

      const currentDraft = await readDraft();
      await putDraft(withHeroCampaign(campaign.id), currentDraft.revision).then((res) =>
        expect(res.status).toBe(200),
      );
      const rollbackable = await publish();
      expect(rollbackable.status).toBe(201);

      await request(app.getHttpServer())
        .patch(`${CAMPAIGN_BASE}/${campaign.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ media: [{ mediaId: otherMediaId, slot: 'HERO_DESKTOP' }] })
        .expect(200);
      const replacement = await publish();
      expect(replacement.status).toBe(201);

      await prisma.merchMedia.update({
        where: { id: media.id },
        data: { deletedAt: new Date() },
      });
      const res = await request(app.getHttpServer())
        .post(`${PUBLICATION_BASE}/${rollbackable.body.id}/rollback`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(409);
      expect(res.body.error).toBe('HOMEPAGE_ROLLBACK_INVALID');
      expect(res.body.errors).toContainEqual(
        expect.objectContaining({ code: 'MEDIA_INELIGIBLE' }),
      );
    });

    it('applies the same campaign eligibility rules to rollback', async () => {
      const now = new Date();
      const cases: Array<{
        state: string;
        data: {
          isEnabled?: boolean;
          archivedAt?: Date;
          startsAt?: Date;
          endsAt?: Date;
        };
        code: string;
      }> = [
        {
          state: 'disabled',
          data: { isEnabled: false },
          code: 'CAMPAIGN_DISABLED',
        },
        {
          state: 'archived',
          data: { archivedAt: new Date(now.getTime() - 60_000) },
          code: 'CAMPAIGN_ARCHIVED',
        },
        {
          state: 'not-started',
          data: {
            startsAt: new Date(now.getTime() + 3_600_000),
            endsAt: new Date(now.getTime() + 7_200_000),
          },
          code: 'CAMPAIGN_NOT_STARTED',
        },
        {
          state: 'expired',
          data: {
            startsAt: new Date(now.getTime() - 7_200_000),
            endsAt: new Date(now.getTime() - 3_600_000),
          },
          code: 'CAMPAIGN_EXPIRED',
        },
      ];

      for (const item of cases) {
        const media = await prisma.merchMedia.create({
          data: {
            originalName: `rollback-${item.state}.jpg`,
            mimeType: 'image/jpeg',
            sizeBytes: 128,
            storageKey: `homepage-e2e/${randomUUID()}`,
            publishedAt: null,
          },
        });
        mediaIds.push(media.id);
        const campaign = await prisma.merchCampaign.create({
          data: {
            internalName: uniqueToken(`rollback-${item.state}`),
            type: 'EDITORIAL',
            titleFa: `Rollback ${item.state}`,
            ...item.data,
          },
        });
        campaignIds.push(campaign.id);

        const snapshot = {
          schemaVersion: 1,
          sections: [
            {
              key: 'hero',
              type: 'HERO_CAROUSEL',
              order: 0,
              isVisible: true,
              settings: {
                campaigns: [
                  {
                    sourceCampaignId: campaign.id,
                    type: 'EDITORIAL',
                    titleFa: `Rollback ${item.state}`,
                    eyebrowFa: null,
                    subtitleFa: null,
                    descriptionFa: null,
                    ctaLabelFa: null,
                    cta: { kind: 'NONE' },
                    productIds: [],
                    categoryIds: [],
                    brandIds: [],
                    media: [
                      {
                        mediaId: media.id,
                        slot: 'HERO_DESKTOP',
                        altFa: null,
                        focalX: 50,
                        focalY: 50,
                        sortOrder: 0,
                      },
                    ],
                    startsAt: null,
                    endsAt: null,
                  },
                ],
              },
            },
          ],
        };
        const max = await prisma.homepagePublication.aggregate({
          _max: { version: true },
        });
        const publication = await prisma.homepagePublication.create({
          data: {
            version: (max._max.version ?? 0) + 1,
            status: 'SUPERSEDED',
            publishAt: null,
            publishedAt: null,
            sections: snapshot as object,
            schemaVersion: 1,
            sourceDraftRevision: 1,
          },
        });
        publicationIds.push(publication.id);

        const res = await request(app.getHttpServer())
          .post(`${PUBLICATION_BASE}/${publication.id}/rollback`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({})
          .expect(409);
        expect(res.body.error).toBe('HOMEPAGE_ROLLBACK_INVALID');
        expect(res.body.errors).toContainEqual(
          expect.objectContaining({ code: item.code }),
        );
      }
    });

    it('cancels only scheduled publications', async () => {
      const published = await prisma.homepagePublication.findFirstOrThrow({
        where: { status: 'PUBLISHED' },
      });
      await request(app.getHttpServer())
        .post(`${PUBLICATION_BASE}/${published.id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);
      await request(app.getHttpServer())
        .post(`${PUBLICATION_BASE}/${randomUUID()}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
      const failureAudit = await prisma.auditLog.findFirst({
        where: {
          action: 'HOMEPAGE_SCHEDULE_CANCEL_FAILED',
          entity: 'HomepagePublication',
          entityId: published.id,
          userId: adminUserId,
        },
      });
      expect(failureAudit).not.toBeNull();
    });

    it('cancelling a scheduled publication never affects the current publication', async () => {
      const current = await prisma.homepagePublication.findFirstOrThrow({
        where: { status: 'PUBLISHED' },
      });
      const beforeMedia = await prisma.merchMedia.findMany({
        where: { id: { in: [heroDesktopMediaId, heroMobileMediaId, otherMediaId] } },
        select: { id: true, publishedAt: true },
      });
      const scheduled = await publish({
        publishAt: new Date(Date.now() + 7_200_000).toISOString(),
      });
      expect(scheduled.status).toBe(201);
      await request(app.getHttpServer())
        .post(`${PUBLICATION_BASE}/${scheduled.body.id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const afterCurrent = await prisma.homepagePublication.findFirstOrThrow({
        where: { status: 'PUBLISHED' },
      });
      expect(afterCurrent.id).toBe(current.id);
      const afterMedia = await prisma.merchMedia.findMany({
        where: { id: { in: [heroDesktopMediaId, heroMobileMediaId, otherMediaId] } },
        select: { id: true, publishedAt: true },
      });
      expect(afterMedia).toEqual(beforeMedia);
    });

    it('serializes publication against campaign source updates', async () => {
      const media = await prisma.merchMedia.create({
        data: {
          originalName: 'campaign-update-race.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 128,
          storageKey: `homepage-e2e/${randomUUID()}`,
          publishedAt: null,
        },
      });
      mediaIds.push(media.id);
      const campaign = await createCampaign({
        type: 'EDITORIAL',
        media: [{ mediaId: media.id, slot: 'HERO_DESKTOP' }],
      });
      const draft = await readDraft();
      await putDraft(withHeroCampaign(campaign.id), draft.revision).then((res) =>
        expect(res.status).toBe(200),
      );
      const oldTitle = campaign.titleFa as string;
      const newTitle = uniqueToken('عنوان هم‌زمان');
      const [publishRes, updateRes] = await Promise.all([
        publish(),
        request(app.getHttpServer())
          .patch(`${CAMPAIGN_BASE}/${campaign.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ titleFa: newTitle }),
      ]);
      expect(publishRes.status).toBe(201);
      expect(updateRes.status).toBe(200);
      const hero = (publishRes.body.sections as Array<Record<string, unknown>>).find(
        (section) => section.key === 'hero',
      ) as { settings: { campaigns: Array<{ titleFa: string }> } };
      expect([oldTitle, newTitle]).toContain(hero.settings.campaigns[0]!.titleFa);
      const stored = await prisma.merchCampaign.findUniqueOrThrow({
        where: { id: campaign.id },
      });
      expect(stored.titleFa).toBe(newTitle);
    });

    it('runs publication, campaign archive, and media deletion without deadlocks', async () => {
      const media = await prisma.merchMedia.create({
        data: {
          originalName: 'concurrent.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 128,
          storageKey: `homepage-e2e/${randomUUID()}`,
          publishedAt: null,
        },
      });
      mediaIds.push(media.id);
      const campaign = await createCampaign({
        type: 'EDITORIAL',
        media: [{ mediaId: media.id, slot: 'HERO_DESKTOP' }],
      });
      const current = await readDraft();
      await putDraft(withHeroCampaign(campaign.id), current.revision).then((res) =>
        expect(res.status).toBe(200),
      );

      const [publishRes, archiveRes] = await Promise.all([
        publish(),
        request(app.getHttpServer())
          .post(`${CAMPAIGN_BASE}/${campaign.id}/archive`)
          .set('Authorization', `Bearer ${adminToken}`),
      ]);
      expect([200, 201, 400, 409]).toContain(publishRes.status);
      expect([200, 409]).toContain(archiveRes.status);
      if (publishRes.status === 201) {
        expect(archiveRes.status).toBe(409);
        const archived = await prisma.merchCampaign.findUniqueOrThrow({
          where: { id: campaign.id },
        });
        expect(archived.archivedAt).toBeNull();
      } else {
        expect(archiveRes.status).toBe(200);
      }

      // A separate campaign for the media deletion race.
      const deletionMedia = await prisma.merchMedia.create({
        data: {
          originalName: 'delete-race.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 128,
          storageKey: `homepage-e2e/${randomUUID()}`,
          publishedAt: null,
        },
      });
      mediaIds.push(deletionMedia.id);
      const deletionCampaign = await createCampaign({
        type: 'EDITORIAL',
        media: [{ mediaId: deletionMedia.id, slot: 'HERO_DESKTOP' }],
      });
      const latest = await readDraft();
      await putDraft(withHeroCampaign(deletionCampaign.id), latest.revision).then((res) =>
        expect(res.status).toBe(200),
      );
      const [publicationDuringDelete, deleteDuringPublication] = await Promise.all([
        publish(),
        request(app.getHttpServer())
          .delete(`${MEDIA_BASE}/${deletionMedia.id}`)
          .set('Authorization', `Bearer ${adminToken}`),
      ]);
      expect([200, 201, 400, 409]).toContain(publicationDuringDelete.status);
      expect([200, 409]).toContain(deleteDuringPublication.status);
      if (publicationDuringDelete.status === 201) {
        expect(deleteDuringPublication.status).toBe(409);
      } else {
        expect(deleteDuringPublication.status).toBe(200);
      }
    });

    it('serializes campaign media assignment against media deletion', async () => {
      const media = await prisma.merchMedia.create({
        data: {
          originalName: 'assign-race.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 128,
          storageKey: `homepage-e2e/${randomUUID()}`,
          publishedAt: null,
        },
      });
      mediaIds.push(media.id);
      const campaign = await createCampaign({ type: 'EDITORIAL' });

      const [patchRes, deleteRes] = await Promise.all([
        request(app.getHttpServer())
          .patch(`${CAMPAIGN_BASE}/${campaign.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ media: [{ mediaId: media.id, slot: 'HERO_DESKTOP' }] }),
        request(app.getHttpServer())
          .delete(`${MEDIA_BASE}/${media.id}`)
          .set('Authorization', `Bearer ${adminToken}`),
      ]);
      expect([200, 400]).toContain(patchRes.status);
      expect([200, 409]).toContain(deleteRes.status);
      if (patchRes.status === 200) {
        expect(deleteRes.status).toBe(409);
        const detail = await request(app.getHttpServer())
          .get(`${CAMPAIGN_BASE}/${campaign.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
        expect(detail.body.media).toHaveLength(1);
      } else {
        expect(deleteRes.status).toBe(200);
      }
    });

    it('leaves current publication and media eligibility unchanged after a failed publish', async () => {
      const current = await prisma.homepagePublication.findFirstOrThrow({
        where: { status: 'PUBLISHED' },
      });
      const beforeMedia = await prisma.merchMedia.findMany({
        where: { id: { in: [heroDesktopMediaId, heroMobileMediaId, otherMediaId] } },
        select: { id: true, publishedAt: true },
      });

      const media = await prisma.merchMedia.create({
        data: {
          originalName: 'failed-publish.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 128,
          storageKey: `homepage-e2e/${randomUUID()}`,
          publishedAt: null,
        },
      });
      mediaIds.push(media.id);
      const campaign = await createCampaign({
        type: 'EDITORIAL',
        media: [{ mediaId: media.id, slot: 'HERO_DESKTOP' }],
      });
      const draft = await readDraft();
      await putDraft(withHeroCampaign(campaign.id), draft.revision).then((res) =>
        expect(res.status).toBe(200),
      );
      await request(app.getHttpServer())
        .post(`${CAMPAIGN_BASE}/${campaign.id}/archive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const failed = await publish();
      expect(failed.status).toBe(400);
      expect(failed.body.error).toBe('HOMEPAGE_DRAFT_INVALID');
      const failureAudit = await prisma.auditLog.findFirst({
        where: {
          action: 'HOMEPAGE_PUBLICATION_FAILED',
          entity: 'HomepagePublication',
          entityId: 'homepage',
          userId: adminUserId,
        },
      });
      expect(failureAudit).not.toBeNull();

      const after = await prisma.homepagePublication.findFirstOrThrow({
        where: { status: 'PUBLISHED' },
      });
      expect(after.id).toBe(current.id);
      const afterMedia = await prisma.merchMedia.findMany({
        where: { id: { in: [heroDesktopMediaId, heroMobileMediaId, otherMediaId] } },
        select: { id: true, publishedAt: true },
      });
      expect(afterMedia).toEqual(beforeMedia);
    });

    it('does not write false failure audits after a committed mutation', async () => {
      const draft = await readDraft();
      await putDraft(baseSections(), draft.revision).then((res) =>
        expect(res.status).toBe(200),
      );

      const publicationFailuresBefore = await prisma.auditLog.count({
        where: { action: 'HOMEPAGE_PUBLICATION_FAILED' },
      });
      jest
        .spyOn(publications, 'getDetail')
        .mockRejectedValueOnce(new Error('post-commit detail failure'));
      await publish({ note: 'hydrate failure' }).then((res) =>
        expect(res.status).toBe(500),
      );
      const published = await prisma.homepagePublication.findFirstOrThrow({
        where: { status: 'PUBLISHED' },
        orderBy: { version: 'desc' },
      });
      publicationIds.push(published.id);
      expect(
        await prisma.auditLog.count({
          where: { action: 'HOMEPAGE_PUBLICATION_FAILED' },
        }),
      ).toBe(publicationFailuresBefore);

      const scheduled = await publish({
        publishAt: new Date(Date.now() + 3_600_000).toISOString(),
      });
      expect(scheduled.status).toBe(201);
      const cancelFailuresBefore = await prisma.auditLog.count({
        where: { action: 'HOMEPAGE_SCHEDULE_CANCEL_FAILED' },
      });
      jest
        .spyOn(publications, 'getDetail')
        .mockRejectedValueOnce(new Error('post-commit detail failure'));
      await request(app.getHttpServer())
        .post(`${PUBLICATION_BASE}/${scheduled.body.id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(500);
      expect(
        (
          await prisma.homepagePublication.findUniqueOrThrow({
            where: { id: scheduled.body.id },
          })
        ).status,
      ).toBe('CANCELLED');
      expect(
        await prisma.auditLog.count({
          where: { action: 'HOMEPAGE_SCHEDULE_CANCEL_FAILED' },
        }),
      ).toBe(cancelFailuresBefore);

      const source = await prisma.homepagePublication.findFirstOrThrow({
        where: { status: 'SUPERSEDED' },
        orderBy: { version: 'desc' },
      });
      const rollbackFailuresBefore = await prisma.auditLog.count({
        where: { action: 'HOMEPAGE_ROLLBACK_FAILED' },
      });
      jest
        .spyOn(publications, 'getDetail')
        .mockRejectedValueOnce(new Error('post-commit detail failure'));
      await request(app.getHttpServer())
        .post(`${PUBLICATION_BASE}/${source.id}/rollback`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(500);
      const rolledBack = await prisma.homepagePublication.findFirstOrThrow({
        where: { status: 'PUBLISHED' },
        orderBy: { version: 'desc' },
      });
      publicationIds.push(rolledBack.id);
      expect(rolledBack.rollbackFromPublicationId).toBe(source.id);
      expect(
        await prisma.auditLog.count({
          where: { action: 'HOMEPAGE_ROLLBACK_FAILED' },
        }),
      ).toBe(rollbackFailuresBefore);
    });

    it('records publication, cancellation, and rollback audits', async () => {
      const rows = await prisma.auditLog.findMany({
        where: { entity: 'HomepagePublication', entityId: { in: publicationIds } },
      });
      expect(rows.map((row) => row.action)).toEqual(
        expect.arrayContaining([
          'HOMEPAGE_PUBLICATION_SCHEDULED',
          'HOMEPAGE_PUBLICATION_CANCELLED',
          'HOMEPAGE_PUBLICATION_PUBLISHED',
          'HOMEPAGE_ROLLBACK_CREATED',
        ]),
      );
      expect(JSON.stringify(rows.map((row) => row.after))).not.toContain('storageKey');
    });
  });
});
