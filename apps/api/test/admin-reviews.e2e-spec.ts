import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductCondition } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const ADMIN_BASE = '/api/v1/admin/reviews';
const REVIEWS_BASE = '/api/v1/reviews';

/** DTO key pins — any shape change must update these lists. */
const ADMIN_REVIEW_LIST_KEYS = ['items', 'limit', 'page', 'total'];
const ADMIN_REVIEW_ITEM_KEYS = [
  'comment',
  'createdAt',
  'id',
  'productId',
  'productName',
  'productSlug',
  'rating',
  'status',
  'statusFa',
];

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Operator review moderation queue (SS-240D). Proves the admin contract:
 * anonymous callers get 401, customers get 403, the queue defaults to the
 * PENDING worklist newest-first with denormalized product fields, the status
 * filter audits already-moderated rows, invalid statuses 400, and approving
 * through the SS-236 moderation route moves the row between queue filters.
 */
describe('Admin reviews API (SS-240D) (e2e)', () => {
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

  it('rejects anonymous callers with 401 and customers with 403', async () => {
    await request(app.getHttpServer()).get(ADMIN_BASE).expect(401);

    const customer = await createUserWithToken();
    await request(app.getHttpServer())
      .get(ADMIN_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(403);
  });

  it('serves the PENDING worklist newest-first with product fields', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const customer = await createUserWithToken();
    const other = await createUserWithToken();
    const productName = `نقد مدیریتی ${uniqueSuffix()}`;
    const { productId, slug } = await seedPublishedProduct(
      operator.token,
      productName,
    );

    // Two filings: the newer one must lead the queue.
    const first = await request(app.getHttpServer())
      .post(REVIEWS_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ productId, rating: 5, comment: 'عالی بود.' })
      .expect(201);
    reviewIds.push(first.body.id as string);
    const second = await request(app.getHttpServer())
      .post(REVIEWS_BASE)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ productId, rating: 2 })
      .expect(201);
    reviewIds.push(second.body.id as string);

    // Default queue (no status) = PENDING worklist with pinned keys.
    await request(app.getHttpServer())
      .get(ADMIN_BASE)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200)
      .then((res) => {
        expect(Object.keys(res.body).sort()).toEqual(ADMIN_REVIEW_LIST_KEYS);
        expect(res.body).toMatchObject({ total: 2, page: 1, limit: 20 });
        expect(res.body.items).toHaveLength(2);
        expect(Object.keys(res.body.items[0]).sort()).toEqual(
          ADMIN_REVIEW_ITEM_KEYS,
        );
        // Newest first.
        expect(res.body.items[0].id).toBe(second.body.id);
        expect(res.body.items[1].id).toBe(first.body.id);
        for (const item of res.body.items) {
          expect(item).toMatchObject({
            productId,
            productName,
            productSlug: slug,
            status: 'PENDING',
            statusFa: 'در انتظار بررسی',
          });
        }
      });

    // Explicit PENDING matches the default; APPROVED is empty so far.
    await request(app.getHttpServer())
      .get(`${ADMIN_BASE}?status=PENDING`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200)
      .then((res) => {
        expect(res.body.total).toBe(2);
      });
    await request(app.getHttpServer())
      .get(`${ADMIN_BASE}?status=APPROVED`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200)
      .then((res) => {
        expect(res.body).toMatchObject({ items: [], total: 0 });
      });

    // Invalid status → 400 with a Persian message.
    await request(app.getHttpServer())
      .get(`${ADMIN_BASE}?status=BOGUS`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(400);

    // Approving through the SS-236 route moves the row between filters.
    await request(app.getHttpServer())
      .patch(`${REVIEWS_BASE}/${first.body.id}/approve`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(ADMIN_BASE)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200)
      .then((res) => {
        expect(res.body.total).toBe(1);
        expect(res.body.items[0].id).toBe(second.body.id);
      });
    await request(app.getHttpServer())
      .get(`${ADMIN_BASE}?status=APPROVED`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200)
      .then((res) => {
        expect(res.body.total).toBe(1);
        expect(res.body.items[0].id).toBe(first.body.id);
      });

    // Pagination is honoured.
    await request(app.getHttpServer())
      .get(`${ADMIN_BASE}?page=2&limit=1`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200)
      .then((res) => {
        expect(res.body).toMatchObject({ total: 1, page: 2, limit: 1 });
        expect(res.body.items).toHaveLength(0);
      });
  });
});
