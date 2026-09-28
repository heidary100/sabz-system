import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductCondition } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const REVIEWS_BASE = '/api/v1/reviews';
const PRODUCTS_BASE = '/api/v1/catalog/products';

/** DTO key pins — any shape change must update these lists. */
const REVIEW_KEYS = [
  'comment',
  'createdAt',
  'id',
  'productId',
  'rating',
  'status',
  'statusFa',
];
const REVIEW_LIST_KEYS = [
  'items',
  'limit',
  'page',
  'ratingAverage',
  'ratingCount',
  'total',
];

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Product reviews API (SS-236, master plan §5.8). Proves the moderation
 * contract: anonymous filing is 401 while the approved list is public,
 * reviews start PENDING and stay invisible until an OPERATOR/ADMIN
 * approves them, one review per user×product (409), unpublished products
 * 404, non-operators get 403 on moderation, already-moderated rows 409,
 * and the listing/detail aggregates plus the star-bucket facet follow the
 * approved rows.
 */
describe('Reviews API (SS-236) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;

  const mobiles: string[] = [];
  const userIds: string[] = [];
  const roleIds: Record<string, string> = {};
  const brandIds: string[] = [];
  const categoryIds: string[] = [];
  const productIds: string[] = [];
  const variantIds: string[] = [];
  const reviewIds: string[] = [];

  async function seedRole(name: string): Promise<string> {
    const existing = await prisma.role.findUnique({ where: { name } });
    if (existing) {
      return existing.id;
    }
    try {
      const created = await prisma.role.create({ data: { name } });
      return created.id;
    } catch {
      const row = await prisma.role.findUnique({ where: { name } });
      if (row) {
        return row.id;
      }
      throw new Error(`Failed to seed role ${name}`);
    }
  }

  beforeAll(async () => {
    process.env.WATERMARK_ENABLED = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    tokenService = app.get(TokenService);

    for (const role of ['OPERATOR', 'ADMIN']) {
      roleIds[role] = await seedRole(role);
    }
  });

  afterAll(async () => {
    await prisma.review.deleteMany({ where: { id: { in: reviewIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: brandIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: [...userIds, ...reviewIds] } },
          { userId: { in: userIds } },
        ],
      },
    });
    await prisma.userSession.deleteMany({
      where: { user: { mobile: { in: mobiles } } },
    });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { mobile: { in: mobiles } } });
    await app.close();
  });

  async function createUserWithToken(
    role?: string,
  ): Promise<{ userId: string; token: string }> {
    const mobile = uniqueMobile();
    mobiles.push(mobile);
    const user = await prisma.user.create({
      data: { mobile, status: 'ACTIVE' },
    });
    userIds.push(user.id);
    if (role) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: roleIds[role]!, assignedBy: user.id },
      });
    }
    const tokens = await tokenService.createSession(user.id);
    return { userId: user.id, token: tokens.accessToken };
  }

  async function seedPublishedProduct(
    token: string,
    name: string,
  ): Promise<{ productId: string; slug: string }> {
    const suffix = uniqueSuffix();
    const brand = await prisma.brand.create({
      data: { name: `برند ${suffix}`, slug: `brand-${suffix}` },
    });
    brandIds.push(brand.id);
    const category = await prisma.category.create({
      data: { name: `دسته ${suffix}`, slug: `cat-${suffix}` },
    });
    categoryIds.push(category.id);
    const product = await request(app.getHttpServer())
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
      })
      .expect(201);
    productIds.push(product.body.id);
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${product.body.id}/variants`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sku: `SKU-${suffix}`, price: '5000.00' })
      .expect(201);
    variantIds.push(variant.body.id);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${product.body.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const row = await prisma.product.findUniqueOrThrow({
      where: { id: product.body.id },
      select: { slug: true },
    });
    return { productId: product.body.id as string, slug: row.slug };
  }

  it('rejects anonymous filing and moderation with 401, keeps the list public', async () => {
    const id = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    await request(app.getHttpServer()).post(REVIEWS_BASE).send({}).expect(401);
    await request(app.getHttpServer())
      .patch(`${REVIEWS_BASE}/${id}/approve`)
      .send({})
      .expect(401);
    await request(app.getHttpServer())
      .post(`${REVIEWS_BASE}/${id}/reject`)
      .send({})
      .expect(401);
    // Public list of a missing product is 404, not 401.
    await request(app.getHttpServer())
      .get(`${REVIEWS_BASE}/product/${id}`)
      .expect(404);
  });

  it('files PENDING reviews, hides them until approval, then aggregates', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const customer = await createUserWithToken();
    const other = await createUserWithToken();
    const { productId, slug } = await seedPublishedProduct(
      operator.token,
      `دیدگاه ${uniqueSuffix()}`,
    );

    // Customer files: PENDING, invisible publicly.
    const created = await request(app.getHttpServer())
      .post(REVIEWS_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ productId, rating: 5, comment: 'عالی بود.' })
      .expect(201);
    expect(Object.keys(created.body).sort()).toEqual(REVIEW_KEYS);
    expect(created.body).toMatchObject({
      productId,
      rating: 5,
      comment: 'عالی بود.',
      status: 'PENDING',
      statusFa: 'در انتظار بررسی',
    });
    const reviewId = created.body.id as string;
    reviewIds.push(reviewId);

    // Duplicate filing → 409.
    await request(app.getHttpServer())
      .post(REVIEWS_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ productId, rating: 4 })
      .expect(409);

    // Out-of-range rating → 400.
    await request(app.getHttpServer())
      .post(REVIEWS_BASE)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ productId, rating: 6 })
      .expect(400);

    // Pending rows stay invisible: empty list, null aggregate.
    await request(app.getHttpServer())
      .get(`${REVIEWS_BASE}/product/${productId}`)
      .expect(200)
      .then((res) => {
        expect(Object.keys(res.body).sort()).toEqual(REVIEW_LIST_KEYS);
        expect(res.body).toMatchObject({
          items: [],
          total: 0,
          ratingAverage: null,
          ratingCount: 0,
        });
      });

    // Non-operator moderation → 403.
    await request(app.getHttpServer())
      .patch(`${REVIEWS_BASE}/${reviewId}/approve`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(403);

    // Operator approves: visible with a 5.0 aggregate.
    await request(app.getHttpServer())
      .patch(`${REVIEWS_BASE}/${reviewId}/approve`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200)
      .then((res) => {
        expect(Object.keys(res.body).sort()).toEqual(REVIEW_KEYS);
        expect(res.body.status).toBe('APPROVED');
      });

    // Double moderation → 409.
    await request(app.getHttpServer())
      .patch(`${REVIEWS_BASE}/${reviewId}/approve`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(409);

    // Second reviewer + approval → average 4.5 over two rows.
    const second = await request(app.getHttpServer())
      .post(REVIEWS_BASE)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ productId, rating: 4 })
      .expect(201);
    reviewIds.push(second.body.id as string);
    await request(app.getHttpServer())
      .patch(`${REVIEWS_BASE}/${second.body.id}/approve`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${REVIEWS_BASE}/product/${productId}`)
      .expect(200)
      .then((res) => {
        expect(res.body.total).toBe(2);
        expect(res.body.ratingAverage).toBe(4.5);
        expect(res.body.ratingCount).toBe(2);
        expect(res.body.items).toHaveLength(2);
        // Newest first: the 4-star row leads.
        expect(res.body.items[0].rating).toBe(4);
        expect(res.body.items[1].rating).toBe(5);
      });

    // Card + detail carry the same aggregate truth.
    await request(app.getHttpServer())
      .get(`${PRODUCTS_BASE}?q=${encodeURIComponent(slug)}`)
      .expect(200)
      .then((res) => {
        const card = res.body.items.find(
          (row: { id: string }) => row.id === productId,
        );
        expect(card.ratingAverage).toBe(4.5);
        expect(card.ratingCount).toBe(2);
      });
    await request(app.getHttpServer())
      .get(`${PRODUCTS_BASE}/${slug}`)
      .expect(200)
      .then((res) => {
        expect(res.body.ratingAverage).toBe(4.5);
        expect(res.body.ratingCount).toBe(2);
      });

    // Star-bucket facet: the 4.5-average product matches bucket 5 only.
    await request(app.getHttpServer())
      .get(`${PRODUCTS_BASE}?rating=5&q=${encodeURIComponent(slug)}`)
      .expect(200)
      .then((res) => {
        expect(res.body.total).toBe(1);
      });
    await request(app.getHttpServer())
      .get(`${PRODUCTS_BASE}?rating=4&q=${encodeURIComponent(slug)}`)
      .expect(200)
      .then((res) => {
        expect(res.body.total).toBe(0);
      });
    // Invalid bucket → 400.
    await request(app.getHttpServer())
      .get(`${PRODUCTS_BASE}?rating=6`)
      .expect(400);
  });

  it('rejects reviews for unpublished products and hides rejected rows', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const customer = await createUserWithToken();
    const suffix = uniqueSuffix();
    const brand = await prisma.brand.create({
      data: { name: `برند ${suffix}`, slug: `brand-${suffix}` },
    });
    brandIds.push(brand.id);
    const category = await prisma.category.create({
      data: { name: `دسته ${suffix}`, slug: `cat-${suffix}` },
    });
    categoryIds.push(category.id);
    const draft = await request(app.getHttpServer())
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${operator.token}`)
      .send({
        name: `پیش‌نویس ${suffix}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
      })
      .expect(201);
    productIds.push(draft.body.id);

    await request(app.getHttpServer())
      .post(REVIEWS_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ productId: draft.body.id, rating: 3 })
      .expect(404);
    await request(app.getHttpServer())
      .get(`${REVIEWS_BASE}/product/${draft.body.id}`)
      .expect(404);

    // Rejected rows never surface.
    const { productId } = await seedPublishedProduct(
      operator.token,
      `رد ${uniqueSuffix()}`,
    );
    const filed = await request(app.getHttpServer())
      .post(REVIEWS_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ productId, rating: 2, comment: 'بد بود.' })
      .expect(201);
    reviewIds.push(filed.body.id as string);
    await request(app.getHttpServer())
      .post(`${REVIEWS_BASE}/${filed.body.id}/reject`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200)
      .then((res) => {
        expect(res.body.status).toBe('REJECTED');
        expect(res.body.statusFa).toBe('رد شد');
      });
    await request(app.getHttpServer())
      .get(`${REVIEWS_BASE}/product/${productId}`)
      .expect(200)
      .then((res) => {
        expect(res.body).toMatchObject({
          items: [],
          total: 0,
          ratingAverage: null,
          ratingCount: 0,
        });
      });
  });
});
