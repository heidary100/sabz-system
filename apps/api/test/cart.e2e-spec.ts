import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductCondition } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const CART_BASE = '/api/v1/cart';

/** Cart line DTO keys, pinned — any shape change must update this list. */
const CART_ITEM_KEYS = [
  'addedAt',
  'available',
  'inStock',
  'lineTotal',
  'priceChanged',
  'priceStatus',
  'primaryImageUrl',
  'productId',
  'productName',
  'productSlug',
  'quantity',
  'unitPrice',
  'unitPriceAtAdd',
  'variantId',
  'variantName',
  'variantSku',
];

const CART_RESPONSE_KEYS = ['items', 'subtotal', 'totalQuantity'];

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Customer shopping-cart API (SS-232). Proves the authed contract: anonymous
 * callers get 401 on every route, adds increment idempotently (201 then
 * 200), quantities are absolute-set via PATCH, stock is enforced with 409s
 * carrying the available count, call-for-price variants are rejected with
 * 422, prices are live truth with an add-time snapshot, and each user sees
 * only their own cart shaped with pinned DTO keys.
 */
describe('Cart API (SS-232) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;

  const mobiles: string[] = [];
  const userIds: string[] = [];
  const brandIds: string[] = [];
  const categoryIds: string[] = [];
  const productIds: string[] = [];
  const variantIds: string[] = [];
  const warehouseIds: string[] = [];

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

  async function seedPublishedVariant(
    operatorToken: string,
    name: string,
    stock: number,
  ): Promise<{ productId: string; variantId: string }> {
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

    if (stock > 0) {
      const warehouse = await prisma.warehouse.create({
        data: { code: `WH-${suffix}`, name: `انبار ${suffix}` },
      });
      warehouseIds.push(warehouse.id);
      await prisma.inventoryItem.create({
        data: {
          warehouseId: warehouse.id,
          variantId: variant.body.id,
          quantityOnHand: stock,
        },
      });
    }

    return { productId: product.body.id as string, variantId: variant.body.id as string };
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
    await prisma.inventoryItem.deleteMany({
      where: { variantId: { in: variantIds } },
    });
    await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: brandIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.warehouse.deleteMany({ where: { id: { in: warehouseIds } } });
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
    // Carts cascade from users.
    await prisma.user.deleteMany({ where: { mobile: { in: mobiles } } });
    await app.close();
  });

  it('rejects anonymous callers with 401 on every route', async () => {
    const variantId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    await request(app.getHttpServer()).get(CART_BASE).expect(401);
    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .send({ variantId, quantity: 1 })
      .expect(401);
    await request(app.getHttpServer())
      .patch(`${CART_BASE}/items/${variantId}`)
      .send({ quantity: 1 })
      .expect(401);
    await request(app.getHttpServer())
      .delete(`${CART_BASE}/items/${variantId}`)
      .expect(401);
    await request(app.getHttpServer()).delete(CART_BASE).expect(401);
  });

  it('adds, increments, sets, and removes with pinned DTO keys', async () => {
    const operator = await createUserWithToken(true);
    const customer = await createUserWithToken(false);
    const { productId, variantId } = await seedPublishedVariant(
      operator.token,
      `سبد ${uniqueSuffix()}`,
      10,
    );

    await request(app.getHttpServer())
      .get(CART_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200)
      .then((res) => {
        expect(Object.keys(res.body).sort()).toEqual(CART_RESPONSE_KEYS);
        expect(res.body).toEqual({ items: [], totalQuantity: 0, subtotal: '0' });
      });

    const created = await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ variantId, quantity: 2 })
      .expect(201);
    expect(created.body.productId).toBe(productId);
    expect(Object.keys(created.body).sort()).toEqual(CART_ITEM_KEYS);
    expect(created.body).toMatchObject({
      variantId,
      quantity: 2,
      unitPrice: '5000',
      unitPriceAtAdd: '5000',
      lineTotal: '10000',
      priceChanged: false,
      priceStatus: 'PRICED',
      available: 10,
      inStock: true,
    });
    expect(typeof created.body.addedAt).toBe('string');

    // Repeat add increments the line: 200, quantity 2 + 1.
    const merged = await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ variantId, quantity: 1 })
      .expect(200);
    expect(merged.body.quantity).toBe(3);
    expect(merged.body.unitPriceAtAdd).toBe('5000');

    const listed = await request(app.getHttpServer())
      .get(CART_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(listed.body.totalQuantity).toBe(3);
    expect(listed.body.subtotal).toBe('15000');
    expect(Object.keys(listed.body.items[0]).sort()).toEqual(CART_ITEM_KEYS);

    // PATCH sets the absolute quantity.
    const updated = await request(app.getHttpServer())
      .patch(`${CART_BASE}/items/${variantId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ quantity: 2 })
      .expect(200);
    expect(updated.body.quantity).toBe(2);
    expect(updated.body.lineTotal).toBe('10000');

    // A catalog reprice flips the price-changed flag; the snapshot stays.
    await prisma.productVariant.update({
      where: { id: variantId },
      data: { price: '6000' },
    });
    const repriced = await request(app.getHttpServer())
      .get(CART_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(repriced.body.items[0]).toMatchObject({
      unitPrice: '6000',
      unitPriceAtAdd: '5000',
      lineTotal: '12000',
      priceChanged: true,
    });
    expect(repriced.body.subtotal).toBe('12000');

    const removed = await request(app.getHttpServer())
      .delete(`${CART_BASE}/items/${variantId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(removed.body).toEqual({ removed: true });

    const removedAgain = await request(app.getHttpServer())
      .delete(`${CART_BASE}/items/${variantId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(removedAgain.body).toEqual({ removed: false });

    const cleared = await request(app.getHttpServer())
      .delete(CART_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(cleared.body).toEqual({ cleared: true });
  });

  it('quick-adds by productId, resolving the default purchasable variant', async () => {
    const operator = await createUserWithToken(true);
    const customer = await createUserWithToken(false);
    const auth = { Authorization: `Bearer ${customer.token}` };
    const { productId, variantId } = await seedPublishedVariant(
      operator.token,
      `سریع ${uniqueSuffix()}`,
      4,
    );

    const quick = await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set(auth)
      .send({ productId, quantity: 2 })
      .expect(201);
    expect(quick.body.variantId).toBe(variantId);
    expect(quick.body.quantity).toBe(2);
    expect(Object.keys(quick.body).sort()).toEqual(CART_ITEM_KEYS);

    // Repeating by productId increments the same resolved line.
    const again = await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set(auth)
      .send({ productId, quantity: 1 })
      .expect(200);
    expect(again.body.variantId).toBe(variantId);
    expect(again.body.quantity).toBe(3);

    // Neither identity is a 400; unknown products are 404.
    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set(auth)
      .send({ quantity: 1 })
      .expect(400);
    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set(auth)
      .send({ productId: '3fa85f64-5717-4562-b3fc-2c963f66afa6', quantity: 1 })
      .expect(404);
  });

  it('validates variantId and quantity shapes with 400', async () => {
    const customer = await createUserWithToken(false);
    const badId = 'not-a-uuid';

    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ variantId: badId, quantity: 1 })
      .expect(400);
    for (const quantity of [0, 100, -1]) {
      await request(app.getHttpServer())
        .post(`${CART_BASE}/items`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ variantId: '3fa85f64-5717-4562-b3fc-2c963f66afa6', quantity })
        .expect(400);
    }
    await request(app.getHttpServer())
      .patch(`${CART_BASE}/items/${badId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ quantity: 1 })
      .expect(400);
    await request(app.getHttpServer())
      .delete(`${CART_BASE}/items/${badId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(400);
  });

  it('enforces stock with 409s carrying the available count', async () => {
    const operator = await createUserWithToken(true);
    const customer = await createUserWithToken(false);
    const { variantId } = await seedPublishedVariant(
      operator.token,
      `موجودی ${uniqueSuffix()}`,
      5,
    );
    const auth = { Authorization: `Bearer ${customer.token}` };

    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set(auth)
      .send({ variantId, quantity: 6 })
      .expect(409)
      .then((res) => expect(res.body.available).toBe(5));

    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set(auth)
      .send({ variantId, quantity: 3 })
      .expect(201);

    // Incrementing past stock is rejected too (3 + 3 > 5).
    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set(auth)
      .send({ variantId, quantity: 3 })
      .expect(409)
      .then((res) => expect(res.body.available).toBe(5));

    await request(app.getHttpServer())
      .patch(`${CART_BASE}/items/${variantId}`)
      .set(auth)
      .send({ quantity: 6 })
      .expect(409)
      .then((res) => expect(res.body.available).toBe(5));

    await request(app.getHttpServer())
      .patch(`${CART_BASE}/items/${variantId}`)
      .set(auth)
      .send({ quantity: 5 })
      .expect(200)
      .then((res) => expect(res.body.quantity).toBe(5));
  });

  it('rejects zero-stock variants with 409 (available 0)', async () => {
    const operator = await createUserWithToken(true);
    const customer = await createUserWithToken(false);
    const { variantId } = await seedPublishedVariant(
      operator.token,
      `ناموجود ${uniqueSuffix()}`,
      0,
    );

    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ variantId, quantity: 1 })
      .expect(409)
      .then((res) => expect(res.body.available).toBe(0));
  });

  it('rejects call-for-price variants with 422', async () => {
    const operator = await createUserWithToken(true);
    const customer = await createUserWithToken(false);
    const { variantId } = await seedPublishedVariant(
      operator.token,
      `استعلام ${uniqueSuffix()}`,
      5,
    );
    await prisma.productVariant.update({
      where: { id: variantId },
      data: { priceStatus: 'CALL_FOR_PRICE' },
    });

    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ variantId, quantity: 1 })
      .expect(422);
  });

  it('returns 404 for unknown, unpublished, and not-in-cart variants', async () => {
    const operator = await createUserWithToken(true);
    const customer = await createUserWithToken(false);
    const auth = { Authorization: `Bearer ${customer.token}` };

    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set(auth)
      .send({ variantId: '3fa85f64-5717-4562-b3fc-2c963f66afa6', quantity: 1 })
      .expect(404);

    await request(app.getHttpServer())
      .patch(`${CART_BASE}/items/3fa85f64-5717-4562-b3fc-2c963f66afa6`)
      .set(auth)
      .send({ quantity: 1 })
      .expect(404);

    // DRAFT products cannot be added.
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
    const draftVariant = await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${draft.body.id}/variants`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ sku: `SKU-${suffix}`, price: '5000.00' })
      .expect(201);
    variantIds.push(draftVariant.body.id);

    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set(auth)
      .send({ variantId: draftVariant.body.id, quantity: 1 })
      .expect(404);
  });

  it('isolates users and hides archived products from the list', async () => {
    const operator = await createUserWithToken(true);
    const first = await createUserWithToken(false);
    const second = await createUserWithToken(false);
    const { productId, variantId } = await seedPublishedVariant(
      operator.token,
      `بایگانی ${uniqueSuffix()}`,
      5,
    );

    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set('Authorization', `Bearer ${first.token}`)
      .send({ variantId, quantity: 1 })
      .expect(201);

    await request(app.getHttpServer())
      .get(CART_BASE)
      .set('Authorization', `Bearer ${second.token}`)
      .expect(200)
      .then((res) =>
        expect(res.body).toEqual({ items: [], totalQuantity: 0, subtotal: '0' }),
      );

    await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${productId}/archive`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(CART_BASE)
      .set('Authorization', `Bearer ${first.token}`)
      .expect(200)
      .then((res) =>
        expect(res.body).toEqual({ items: [], totalQuantity: 0, subtotal: '0' }),
      );
  });
});
