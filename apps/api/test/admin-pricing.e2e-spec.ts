import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductCondition } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(120_000);

const RULES_BASE = '/api/v1/admin/pricing/category-rules';
const OVERRIDES_BASE = '/api/v1/admin/pricing/product-overrides';
const PROMOTIONS_BASE = '/api/v1/admin/pricing/promotions';

/** DTO key pins — any shape change must update these lists. */
const PRICING_LIST_KEYS = ['items', 'limit', 'page', 'total'];
const RULE_KEYS = [
  'categoryId',
  'categoryName',
  'createdAt',
  'endsAt',
  'id',
  'isActive',
  'priority',
  'startsAt',
  'type',
  'updatedAt',
  'value',
];
const OVERRIDE_KEYS = [
  'createdAt',
  'endsAt',
  'id',
  'isActive',
  'productId',
  'productName',
  'startsAt',
  'type',
  'updatedAt',
  'value',
];
const PROMOTION_KEYS = [
  'brandId',
  'categoryId',
  'code',
  'createdAt',
  'endsAt',
  'id',
  'isActive',
  'minQuantity',
  'productId',
  'startsAt',
  'titleFa',
  'type',
  'updatedAt',
  'value',
];

const UNKNOWN_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Operator pricing management API (SS-240B). Proves the admin contract:
 * anonymous callers get 401 everywhere, customers get 403, lists return the
 * exact `PaginatedResult` envelope with pinned row keys, each resource walks
 * a full create → read → update → delete round-trip with exact key pins,
 * unknown ids 404, duplicate overrides / promotion codes 409, inverted
 * windows and PERCENT > 100 get 400, and every mutation writes exactly one
 * audit event with the SS-240B action name.
 */
describe('Admin pricing API (SS-240B) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;

  const mobiles: string[] = [];
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const productIds: string[] = [];
  const ruleIds: string[] = [];
  const overrideIds: string[] = [];
  const promotionIds: string[] = [];

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

  async function createUserWithToken(
    role?: string,
  ): Promise<{ userId: string; mobile: string; token: string }> {
    const mobile = uniqueMobile();
    mobiles.push(mobile);
    const user = await prisma.user.create({
      data: { mobile, status: 'ACTIVE' },
    });
    userIds.push(user.id);
    if (role) {
      const roleRow = await prisma.role.findUniqueOrThrow({
        where: { name: role },
      });
      await prisma.userRole.create({
        data: { userId: user.id, roleId: roleRow.id, assignedBy: user.id },
      });
    }
    const tokens = await tokenService.createSession(user.id);
    return { userId: user.id, mobile, token: tokens.accessToken };
  }

  async function seedCategory(): Promise<{ id: string; name: string }> {
    const suffix = uniqueSuffix();
    const category = await prisma.category.create({
      data: { name: `دسته قیمت ${suffix}`, slug: `pricing-cat-${suffix}` },
    });
    categoryIds.push(category.id);
    return { id: category.id, name: category.name };
  }

  async function seedProduct(categoryId: string): Promise<{ id: string; name: string }> {
    const suffix = uniqueSuffix();
    const product = await prisma.product.create({
      data: {
        name: `محصول قیمت ${suffix}`,
        slug: `pricing-prod-${suffix}`,
        categoryId,
        condition: ProductCondition.NEW,
      },
    });
    productIds.push(product.id);
    return { id: product.id, name: product.name };
  }

  async function auditCount(action: string, entityId: string): Promise<number> {
    return prisma.auditLog.count({ where: { action, entityId } });
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

    await seedRole('OPERATOR');
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [...ruleIds, ...overrideIds, ...promotionIds] } },
    });
    await prisma.categoryPriceRule.deleteMany({ where: { id: { in: ruleIds } } });
    await prisma.productPriceOverride.deleteMany({ where: { id: { in: overrideIds } } });
    await prisma.promotion.deleteMany({ where: { id: { in: promotionIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
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
    await prisma.user.deleteMany({ where: { mobile: { in: mobiles } } });
    await app.close();
  });

  it('rejects anonymous callers with 401 and customers with 403', async () => {
    for (const base of [RULES_BASE, OVERRIDES_BASE, PROMOTIONS_BASE]) {
      await request(app.getHttpServer()).get(base).expect(401);
      await request(app.getHttpServer()).post(base).send({}).expect(401);
      await request(app.getHttpServer()).get(`${base}/${UNKNOWN_ID}`).expect(401);
      await request(app.getHttpServer())
        .patch(`${base}/${UNKNOWN_ID}`)
        .send({})
        .expect(401);
      await request(app.getHttpServer()).delete(`${base}/${UNKNOWN_ID}`).expect(401);
    }

    const customer = await createUserWithToken();
    for (const base of [RULES_BASE, OVERRIDES_BASE, PROMOTIONS_BASE]) {
      await request(app.getHttpServer())
        .get(base)
        .set('Authorization', `Bearer ${customer.token}`)
        .expect(403);
      await request(app.getHttpServer())
        .post(base)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({})
        .expect(403);
      await request(app.getHttpServer())
        .delete(`${base}/${UNKNOWN_ID}`)
        .set('Authorization', `Bearer ${customer.token}`)
        .expect(403);
    }
  });

  it('walks the category-rule round-trip with pinned keys and audits', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const category = await seedCategory();
    const auth = { Authorization: `Bearer ${operator.token}` };

    const before = await auditCount('CATEGORY_PRICE_RULE_CREATED', 'none');
    expect(before).toBe(0);

    const created = await request(app.getHttpServer())
      .post(RULES_BASE)
      .set(auth)
      .send({ categoryId: category.id, type: 'PERCENT', value: '10', priority: 2 })
      .expect(201);
    expect(Object.keys(created.body).sort()).toEqual(RULE_KEYS);
    expect(created.body).toMatchObject({
      categoryId: category.id,
      categoryName: category.name,
      type: 'PERCENT',
      value: '10',
      isActive: true,
      startsAt: null,
      endsAt: null,
      priority: 2,
    });
    const ruleId = created.body.id as string;
    ruleIds.push(ruleId);
    expect(await auditCount('CATEGORY_PRICE_RULE_CREATED', ruleId)).toBe(1);

    const listed = await request(app.getHttpServer())
      .get(RULES_BASE)
      .set(auth)
      .expect(200);
    expect(Object.keys(listed.body).sort()).toEqual(PRICING_LIST_KEYS);
    expect(listed.body).toMatchObject({ page: 1, limit: 20 });
    const row = (listed.body.items as Array<{ id: string }>).find(
      (item) => item.id === ruleId,
    );
    expect(row).toBeDefined();
    expect(Object.keys(row!).sort()).toEqual(RULE_KEYS);

    const detail = await request(app.getHttpServer())
      .get(`${RULES_BASE}/${ruleId}`)
      .set(auth)
      .expect(200);
    expect(Object.keys(detail.body).sort()).toEqual(RULE_KEYS);

    const updated = await request(app.getHttpServer())
      .patch(`${RULES_BASE}/${ruleId}`)
      .set(auth)
      .send({ value: '15', priority: 1 })
      .expect(200);
    expect(updated.body).toMatchObject({ value: '15', priority: 1 });
    expect(await auditCount('CATEGORY_PRICE_RULE_UPDATED', ruleId)).toBe(1);

    await request(app.getHttpServer())
      .get(`${RULES_BASE}/${UNKNOWN_ID}`)
      .set(auth)
      .expect(404);

    await request(app.getHttpServer())
      .get(`${RULES_BASE}/not-a-uuid`)
      .set(auth)
      .expect(400);

    const deleted = await request(app.getHttpServer())
      .delete(`${RULES_BASE}/${ruleId}`)
      .set(auth)
      .expect(200);
    expect(deleted.body).toMatchObject({ id: ruleId });
    expect(await auditCount('CATEGORY_PRICE_RULE_DELETED', ruleId)).toBe(1);

    await request(app.getHttpServer())
      .get(`${RULES_BASE}/${ruleId}`)
      .set(auth)
      .expect(404);
  });

  it('400s bad rule input: inverted window and PERCENT over 100', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const category = await seedCategory();
    const auth = { Authorization: `Bearer ${operator.token}` };

    await request(app.getHttpServer())
      .post(RULES_BASE)
      .set(auth)
      .send({
        categoryId: category.id,
        type: 'PERCENT',
        value: '10',
        startsAt: '2026-12-31T00:00:00.000Z',
        endsAt: '2026-10-01T00:00:00.000Z',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(RULES_BASE)
      .set(auth)
      .send({ categoryId: category.id, type: 'PERCENT', value: '101' })
      .expect(400);

    await request(app.getHttpServer())
      .post(RULES_BASE)
      .set(auth)
      .send({ categoryId: UNKNOWN_ID, type: 'PERCENT', value: '10' })
      .expect(404);
  });

  it('walks the product-override round-trip and 409s duplicates', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const category = await seedCategory();
    const product = await seedProduct(category.id);
    const auth = { Authorization: `Bearer ${operator.token}` };

    const created = await request(app.getHttpServer())
      .post(OVERRIDES_BASE)
      .set(auth)
      .send({ productId: product.id, type: 'FIXED', value: '5000' })
      .expect(201);
    expect(Object.keys(created.body).sort()).toEqual(OVERRIDE_KEYS);
    expect(created.body).toMatchObject({
      productId: product.id,
      productName: product.name,
      type: 'FIXED',
      value: '5000',
      isActive: true,
    });
    const overrideId = created.body.id as string;
    overrideIds.push(overrideId);
    expect(await auditCount('PRODUCT_PRICE_OVERRIDE_CREATED', overrideId)).toBe(1);

    await request(app.getHttpServer())
      .post(OVERRIDES_BASE)
      .set(auth)
      .send({ productId: product.id, type: 'FIXED', value: '6000' })
      .expect(409);

    const listed = await request(app.getHttpServer())
      .get(OVERRIDES_BASE)
      .set(auth)
      .expect(200);
    expect(Object.keys(listed.body).sort()).toEqual(PRICING_LIST_KEYS);
    expect(Object.keys(listed.body.items[0]).sort()).toEqual(OVERRIDE_KEYS);

    const updated = await request(app.getHttpServer())
      .patch(`${OVERRIDES_BASE}/${overrideId}`)
      .set(auth)
      .send({ isActive: false })
      .expect(200);
    expect(updated.body).toMatchObject({ isActive: false });
    expect(await auditCount('PRODUCT_PRICE_OVERRIDE_UPDATED', overrideId)).toBe(1);

    const activeOnly = await request(app.getHttpServer())
      .get(`${OVERRIDES_BASE}?isActive=true`)
      .set(auth)
      .expect(200);
    expect(
      (activeOnly.body.items as Array<{ id: string }>).some(
        (item) => item.id === overrideId,
      ),
    ).toBe(false);

    await request(app.getHttpServer())
      .get(`${OVERRIDES_BASE}/${UNKNOWN_ID}`)
      .set(auth)
      .expect(404);

    await request(app.getHttpServer())
      .delete(`${OVERRIDES_BASE}/${overrideId}`)
      .set(auth)
      .expect(200);
    expect(await auditCount('PRODUCT_PRICE_OVERRIDE_DELETED', overrideId)).toBe(1);
  });

  it('walks the promotion round-trip, 409s duplicate codes, 400s bad windows', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const auth = { Authorization: `Bearer ${operator.token}` };
    const code = `PRM-${uniqueSuffix()}`;

    const created = await request(app.getHttpServer())
      .post(PROMOTIONS_BASE)
      .set(auth)
      .send({
        code,
        titleFa: 'فروش ویژه آزمون',
        type: 'PERCENT',
        value: '20',
        startsAt: '2026-10-01T00:00:00.000Z',
        endsAt: '2026-12-31T00:00:00.000Z',
      })
      .expect(201);
    expect(Object.keys(created.body).sort()).toEqual(PROMOTION_KEYS);
    expect(created.body).toMatchObject({
      code,
      titleFa: 'فروش ویژه آزمون',
      type: 'PERCENT',
      value: '20',
      productId: null,
      categoryId: null,
      brandId: null,
      minQuantity: 1,
    });
    const promotionId = created.body.id as string;
    promotionIds.push(promotionId);
    expect(await auditCount('PROMOTION_CREATED', promotionId)).toBe(1);

    await request(app.getHttpServer())
      .post(PROMOTIONS_BASE)
      .set(auth)
      .send({
        code,
        titleFa: 'تکراری',
        type: 'PERCENT',
        value: '5',
        startsAt: '2026-10-01T00:00:00.000Z',
        endsAt: '2026-12-31T00:00:00.000Z',
      })
      .expect(409);

    await request(app.getHttpServer())
      .post(PROMOTIONS_BASE)
      .set(auth)
      .send({
        code: `PRM-${uniqueSuffix()}`,
        titleFa: 'بازه نامعتبر',
        type: 'FIXED',
        value: '1000',
        startsAt: '2026-12-31T00:00:00.000Z',
        endsAt: '2026-10-01T00:00:00.000Z',
      })
      .expect(400);

    const otherCode = `PRM-${uniqueSuffix()}`;
    const other = await request(app.getHttpServer())
      .post(PROMOTIONS_BASE)
      .set(auth)
      .send({
        code: otherCode,
        titleFa: 'پروموشن دوم',
        type: 'FIXED',
        value: '1000',
        startsAt: '2026-10-01T00:00:00.000Z',
        endsAt: '2026-12-31T00:00:00.000Z',
      })
      .expect(201);
    promotionIds.push(other.body.id as string);

    await request(app.getHttpServer())
      .patch(`${PROMOTIONS_BASE}/${other.body.id}`)
      .set(auth)
      .send({ code })
      .expect(409);

    const listed = await request(app.getHttpServer())
      .get(PROMOTIONS_BASE)
      .set(auth)
      .expect(200);
    expect(Object.keys(listed.body).sort()).toEqual(PRICING_LIST_KEYS);
    expect(Object.keys(listed.body.items[0]).sort()).toEqual(PROMOTION_KEYS);

    const updated = await request(app.getHttpServer())
      .patch(`${PROMOTIONS_BASE}/${promotionId}`)
      .set(auth)
      .send({ titleFa: 'ویرایش‌شده', minQuantity: 3 })
      .expect(200);
    expect(updated.body).toMatchObject({ titleFa: 'ویرایش‌شده', minQuantity: 3 });
    expect(await auditCount('PROMOTION_UPDATED', promotionId)).toBe(1);

    await request(app.getHttpServer())
      .get(`${PROMOTIONS_BASE}/${UNKNOWN_ID}`)
      .set(auth)
      .expect(404);

    await request(app.getHttpServer())
      .delete(`${PROMOTIONS_BASE}/${promotionId}`)
      .set(auth)
      .expect(200);
    expect(await auditCount('PROMOTION_DELETED', promotionId)).toBe(1);
  });
});
