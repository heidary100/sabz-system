import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductCondition } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const WISHLIST_BASE = '/api/v1/wishlist';

/** Card keys pinned by public-catalog.e2e-spec.ts, plus the wishlist timestamp. */
const WISHLIST_ITEM_KEYS = [
  'addedAt',
  'brand',
  'callForPrice',
  'category',
  'compareAtPrice',
  'condition',
  'id',
  'inStock',
  'name',
  'priceFrom',
  'primaryImageUrl',
  'primaryThumbnailUrl',
  'promotionEndsAt',
  'ratingAverage',
  'ratingCount',
  'slug',
  'variantCount',
];

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Customer wishlist API (SS-231). Proves the authed contract: anonymous
 * callers get 401 on every route, saves are idempotent (201 then 200),
 * only PUBLISHED products can be saved, removal is idempotent, and each
 * user sees only their own rows shaped exactly like listing cards plus
 * `addedAt`.
 */
describe('Wishlist API (SS-231) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;

  const mobiles: string[] = [];
  const userIds: string[] = [];
  const brandIds: string[] = [];
  const categoryIds: string[] = [];
  const productIds: string[] = [];
  const variantIds: string[] = [];

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

  async function createUserWithToken(withOperatorRole: boolean): Promise<{
    userId: string;
    token: string;
  }> {
    const mobile = uniqueMobile();
    mobiles.push(mobile);
    const user = await prisma.user.create({
      data: { mobile, status: 'ACTIVE' },
    });
    userIds.push(user.id);
    if (withOperatorRole) {
      const role = await prisma.role.findUniqueOrThrow({
        where: { name: 'OPERATOR' },
      });
      await prisma.userRole.create({
        data: { userId: user.id, roleId: role.id, assignedBy: user.id },
      });
      await prisma.userProfile.create({
        data: { userId: user.id, firstName: 'علی', lastName: 'احمدی' },
      });
    }
    const tokens = await tokenService.createSession(user.id);
    return { userId: user.id, token: tokens.accessToken };
  }

  async function seedPublishedProduct(
    operatorToken: string,
    name: string,
  ): Promise<string> {
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
      .set('Authorization', `Bearer ${operatorToken}`)
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
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ sku: `SKU-${suffix}`, price: '5000.00' })
      .expect(201);
    variantIds.push(variant.body.id);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${product.body.id}/publish`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);

    return product.body.id as string;
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

    await seedRole('OPERATOR');
  });

  afterAll(async () => {
    await prisma.wishlistItem.deleteMany({
      where: { user: { mobile: { in: mobiles } } },
    });
    await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: brandIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ entityId: { in: userIds } }, { userId: { in: userIds } }],
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

  it('rejects anonymous callers with 401 on every route', async () => {
    await request(app.getHttpServer()).get(WISHLIST_BASE).expect(401);
    await request(app.getHttpServer())
      .post(WISHLIST_BASE)
      .send({ productId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
      .expect(401);
    await request(app.getHttpServer())
      .delete(`${WISHLIST_BASE}/3fa85f64-5717-4562-b3fc-2c963f66afa6`)
      .expect(401);
  });

  it('saves, lists, and removes idempotently with pinned DTO keys', async () => {
    const operator = await createUserWithToken(true);
    const customer = await createUserWithToken(false);
    const productId = await seedPublishedProduct(
      operator.token,
      `علاقه ${uniqueSuffix()}`,
    );

    await request(app.getHttpServer())
      .get(WISHLIST_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200)
      .then((res) => {
        expect(res.body).toEqual({ items: [], total: 0 });
      });

    const created = await request(app.getHttpServer())
      .post(WISHLIST_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ productId })
      .expect(201);
    expect(created.body.id).toBe(productId);
    expect(Object.keys(created.body).sort()).toEqual(WISHLIST_ITEM_KEYS);
    expect(typeof created.body.addedAt).toBe('string');
    expect(created.body.priceFrom).toBe('5000');

    // Repeat save is idempotent: 200, still exactly one row.
    await request(app.getHttpServer())
      .post(WISHLIST_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ productId })
      .expect(200);

    const listed = await request(app.getHttpServer())
      .get(WISHLIST_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(listed.body.total).toBe(1);
    expect(listed.body.items).toHaveLength(1);
    expect(Object.keys(listed.body.items[0]).sort()).toEqual(
      WISHLIST_ITEM_KEYS,
    );

    const removed = await request(app.getHttpServer())
      .delete(`${WISHLIST_BASE}/${productId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(removed.body).toEqual({ removed: true });

    // Repeat removal is idempotent.
    const removedAgain = await request(app.getHttpServer())
      .delete(`${WISHLIST_BASE}/${productId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(removedAgain.body).toEqual({ removed: false });

    await request(app.getHttpServer())
      .get(WISHLIST_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200)
      .then((res) => expect(res.body).toEqual({ items: [], total: 0 }));
  });

  it('validates productId shape with 400', async () => {
    const customer = await createUserWithToken(false);

    await request(app.getHttpServer())
      .post(WISHLIST_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ productId: 'not-a-uuid' })
      .expect(400);
    await request(app.getHttpServer())
      .post(WISHLIST_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .delete(`${WISHLIST_BASE}/not-a-uuid`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(400);
  });

  it('returns 404 for unknown and unpublished products', async () => {
    const operator = await createUserWithToken(true);
    const customer = await createUserWithToken(false);

    await request(app.getHttpServer())
      .post(WISHLIST_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ productId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
      .expect(404);

    // DRAFT products cannot be saved.
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
      .post(WISHLIST_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ productId: draft.body.id })
      .expect(404);
  });

  it('hides archived products from the list and isolates users', async () => {
    const operator = await createUserWithToken(true);
    const first = await createUserWithToken(false);
    const second = await createUserWithToken(false);
    const productId = await seedPublishedProduct(
      operator.token,
      `بایگانی ${uniqueSuffix()}`,
    );

    await request(app.getHttpServer())
      .post(WISHLIST_BASE)
      .set('Authorization', `Bearer ${first.token}`)
      .send({ productId })
      .expect(201);

    // The second user sees an empty list: no cross-user leakage.
    await request(app.getHttpServer())
      .get(WISHLIST_BASE)
      .set('Authorization', `Bearer ${second.token}`)
      .expect(200)
      .then((res) => expect(res.body).toEqual({ items: [], total: 0 }));

    await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${productId}/archive`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(WISHLIST_BASE)
      .set('Authorization', `Bearer ${first.token}`)
      .expect(200)
      .then((res) => expect(res.body).toEqual({ items: [], total: 0 }));
  });
});
