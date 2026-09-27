import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductCondition } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(120_000);

const ORDERS_BASE = '/api/v1/orders';
const CHECKOUT_BASE = '/api/v1/checkout';
const CART_BASE = '/api/v1/cart';
const ADDRESSES_BASE = '/api/v1/addresses';

/** DTO key pins — any shape change must update these lists. */
const SHIPPING_METHOD_KEYS = ['code', 'etaFa', 'fee', 'titleFa'];
const PAYMENT_METHOD_KEYS = ['code', 'descFa', 'enabled', 'titleFa'];
const CHECKOUT_SUMMARY_KEYS = ['items', 'problems', 'shippingFee', 'subtotal', 'total', 'valid'];
const CHECKOUT_LINE_KEYS = [
  'available',
  'inStock',
  'lineTotal',
  'priceChanged',
  'productName',
  'quantity',
  'unitPrice',
  'variantId',
  'variantSku',
];
const CHECKOUT_PROBLEM_KEYS = ['available', 'code', 'message', 'variantId'];
const PLACE_ORDER_KEYS = ['orderId', 'orderNumber', 'status', 'total'];
const ORDER_LIST_KEYS = ['items', 'total'];
const ORDER_LIST_ITEM_KEYS = [
  'createdAt',
  'id',
  'itemCount',
  'orderNumber',
  'status',
  'statusFa',
  'total',
];
const ORDER_DETAIL_KEYS = [
  'addressSnapshot',
  'createdAt',
  'id',
  'items',
  'orderNumber',
  'paymentMethod',
  'paymentStatus',
  'shippingFee',
  'status',
  'statusFa',
  'subtotal',
  'total',
];
const ORDER_ITEM_KEYS = [
  'lineTotal',
  'productName',
  'quantity',
  'sku',
  'unitPrice',
  'variantId',
  'variantName',
];
const ADDRESS_SNAPSHOT_KEYS = [
  'address',
  'city',
  'fullName',
  'phone',
  'postalCode',
  'province',
];
const INVOICE_KEYS = [...ORDER_DETAIL_KEYS, 'customerMobile'].sort();

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const ADDRESS_BODY = {
  fullName: 'علی احمدی',
  phone: '09123456789',
  province: 'مازندران',
  city: 'ساری',
  address: 'ساری، بلوار پاسداران، روبروی مرکز تخصصی پرتو',
  postalCode: '4814938662',
};

/**
 * Customer checkout + orders API (SS-233). Proves the authed contract:
 * anonymous callers get 401 everywhere, choice lists are static, validate
 * previews shortages without side effects, place-order consumes ledger
 * stock with sequential order numbers and snapshots the address, history
 * is newest-first and self-scoped, cancel restocks PENDING orders only,
 * and every DTO carries pinned keys.
 */
describe('Orders + Checkout API (SS-233) (e2e)', () => {
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

  async function createUserWithToken(): Promise<{ userId: string; token: string }> {
    const mobile = uniqueMobile();
    mobiles.push(mobile);
    const user = await prisma.user.create({
      data: { mobile, status: 'ACTIVE' },
    });
    userIds.push(user.id);
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
      .send({ name, brandId: brand.id, categoryId: category.id, condition: ProductCondition.NEW })
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

  async function createAddress(token: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(ADDRESSES_BASE)
      .set('Authorization', `Bearer ${token}`)
      .send(ADDRESS_BODY)
      .expect(201);
    return res.body.id as string;
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
    // Ledger + order rows reference variants/warehouses: unwind in FK order.
    await prisma.order.deleteMany({
      where: { userId: { in: userIds } },
    });
    const reservations = await prisma.reservation.findMany({
      where: { inventoryItem: { variantId: { in: variantIds } } },
      select: { id: true },
    });
    const reservationIds = reservations.map((row) => row.id);
    if (reservationIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entityId: { in: reservationIds } },
      });
      await prisma.reservation.deleteMany({
        where: { id: { in: reservationIds } },
      });
    }
    await prisma.inventoryMovement.deleteMany({
      where: { variantId: { in: variantIds } },
    });
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
    // Carts, addresses and orders cascade from users.
    await prisma.user.deleteMany({ where: { mobile: { in: mobiles } } });
    await app.close();
  });

  it('rejects anonymous callers with 401 on every route', async () => {
    const id = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    await request(app.getHttpServer()).get(`${CHECKOUT_BASE}/shipping-methods`).expect(401);
    await request(app.getHttpServer()).get(`${CHECKOUT_BASE}/payment-methods`).expect(401);
    await request(app.getHttpServer()).post(`${CHECKOUT_BASE}/validate`).send({}).expect(401);
    await request(app.getHttpServer())
      .post(`${ORDERS_BASE}/checkout`)
      .send({ addressId: id, paymentMethod: 'COD' })
      .expect(401);
    await request(app.getHttpServer()).get(ORDERS_BASE).expect(401);
    await request(app.getHttpServer()).get(`${ORDERS_BASE}/${id}`).expect(401);
    await request(app.getHttpServer()).post(`${ORDERS_BASE}/${id}/cancel`).expect(401);
    await request(app.getHttpServer()).get(`${ORDERS_BASE}/${id}/invoice`).expect(401);
  });

  it('serves static shipping and payment choice lists', async () => {
    // SS-234 COD-only: gateway stays disabled unless the env flag is set.
    delete process.env.PAYMENTS_ONLINE_ENABLED;
    delete process.env.COD_ENABLED;
    const customer = await createUserWithToken();

    const shipping = await request(app.getHttpServer())
      .get(`${CHECKOUT_BASE}/shipping-methods`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(shipping.body.items.length).toBeGreaterThan(0);
    for (const item of shipping.body.items) {
      expect(Object.keys(item).sort()).toEqual(SHIPPING_METHOD_KEYS);
    }

    const payment = await request(app.getHttpServer())
      .get(`${CHECKOUT_BASE}/payment-methods`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(payment.body.items.map((item: { code: string }) => item.code).sort()).toEqual([
      'COD',
      'ONLINE',
    ]);
    for (const item of payment.body.items) {
      expect(Object.keys(item).sort()).toEqual(PAYMENT_METHOD_KEYS);
    }
    // SS-234 COD-only: ONLINE listed but disabled, COD enabled.
    expect(
      payment.body.items.find((item: { code: string }) => item.code === 'ONLINE'),
    ).toMatchObject({ enabled: false });
    expect(
      payment.body.items.find((item: { code: string }) => item.code === 'COD'),
    ).toMatchObject({ enabled: true });
  });

  it('rejects ONLINE checkout with 422 while the gateway is disabled (SS-234)', async () => {
    delete process.env.PAYMENTS_ONLINE_ENABLED;
    delete process.env.COD_ENABLED;
    const operator = await createUserWithToken();
    await prisma.role.findUniqueOrThrow({ where: { name: 'OPERATOR' } }).then((role) =>
      prisma.userRole.create({
        data: { userId: operator.userId, roleId: role.id, assignedBy: operator.userId },
      }),
    );
    const customer = await createUserWithToken();
    const { variantId } = await seedPublishedVariant(
      operator.token,
      `پرداخت ${uniqueSuffix()}`,
      5,
    );
    const addressId = await createAddress(customer.token);
    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ variantId, quantity: 1 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`${ORDERS_BASE}/checkout`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ addressId, paymentMethod: 'ONLINE' })
      .expect(422);

    // COD still succeeds for the same cart.
    await request(app.getHttpServer())
      .post(`${ORDERS_BASE}/checkout`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ addressId, paymentMethod: 'COD' })
      .expect(201);
  });

  it('places, lists, details, invoices and cancels with pinned DTO keys', async () => {
    const operator = await createUserWithToken();
    await prisma.role.findUniqueOrThrow({ where: { name: 'OPERATOR' } }).then((role) =>
      prisma.userRole.create({
        data: { userId: operator.userId, roleId: role.id, assignedBy: operator.userId },
      }),
    );
    const customer = await createUserWithToken();
    const { variantId } = await seedPublishedVariant(
      operator.token,
      `سفارش ${uniqueSuffix()}`,
      10,
    );
    const addressId = await createAddress(customer.token);

    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ variantId, quantity: 2 })
      .expect(201);

    // Validate previews without side effects: valid, live-price totals.
    const preview = await request(app.getHttpServer())
      .post(`${CHECKOUT_BASE}/validate`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ addressId })
      .expect(200);
    expect(Object.keys(preview.body).sort()).toEqual(CHECKOUT_SUMMARY_KEYS);
    expect(preview.body).toMatchObject({
      valid: true,
      subtotal: '10000',
      shippingFee: '0',
      total: '10000',
      problems: [],
    });
    expect(Object.keys(preview.body.items[0]).sort()).toEqual(CHECKOUT_LINE_KEYS);

    // Place the order: sequential number, snapshot, cart cleared.
    const placed = await request(app.getHttpServer())
      .post(`${ORDERS_BASE}/checkout`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ addressId, paymentMethod: 'COD' })
      .expect(201);
    expect(Object.keys(placed.body).sort()).toEqual(PLACE_ORDER_KEYS);
    expect(placed.body).toMatchObject({ status: 'PENDING', total: '10000' });
    expect(typeof placed.body.orderNumber).toBe('number');
    expect(placed.body.orderNumber).toBeGreaterThanOrEqual(100001);

    await request(app.getHttpServer())
      .get(CART_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200)
      .then((res) =>
        expect(res.body).toEqual({ items: [], totalQuantity: 0, subtotal: '0' }),
      );

    // History lists newest-first, self-scoped, with pinned keys.
    const listed = await request(app.getHttpServer())
      .get(ORDERS_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(Object.keys(listed.body).sort()).toEqual(ORDER_LIST_KEYS);
    expect(listed.body.total).toBe(1);
    expect(Object.keys(listed.body.items[0]).sort()).toEqual(ORDER_LIST_ITEM_KEYS);
    expect(listed.body.items[0]).toMatchObject({
      id: placed.body.orderId,
      orderNumber: placed.body.orderNumber,
      status: 'PENDING',
      statusFa: expect.any(String),
      itemCount: 1,
      total: '10000',
    });

    // Detail carries the address snapshot and frozen line.
    const detail = await request(app.getHttpServer())
      .get(`${ORDERS_BASE}/${placed.body.orderId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(Object.keys(detail.body).sort()).toEqual(ORDER_DETAIL_KEYS);
    expect(Object.keys(detail.body.addressSnapshot).sort()).toEqual(ADDRESS_SNAPSHOT_KEYS);
    expect(detail.body.addressSnapshot).toMatchObject({
      fullName: ADDRESS_BODY.fullName,
      phone: ADDRESS_BODY.phone,
      city: ADDRESS_BODY.city,
    });
    expect(Object.keys(detail.body.items[0]).sort()).toEqual(ORDER_ITEM_KEYS);
    expect(detail.body.items[0]).toMatchObject({
      variantId,
      quantity: 2,
      unitPrice: '5000',
      lineTotal: '10000',
    });

    // Invoice adds the customer mobile for the print header.
    const invoice = await request(app.getHttpServer())
      .get(`${ORDERS_BASE}/${placed.body.orderId}/invoice`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(Object.keys(invoice.body).sort()).toEqual(INVOICE_KEYS);

    // A second order draws the next sequence number.
    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ variantId, quantity: 1 })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`${ORDERS_BASE}/checkout`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ addressId, paymentMethod: 'COD' })
      .expect(201);
    expect(second.body.orderNumber).toBe(placed.body.orderNumber + 1);

    // Cancel restocks: the order flips to CANCELLED and stock returns.
    const cancelled = await request(app.getHttpServer())
      .post(`${ORDERS_BASE}/${placed.body.orderId}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');

    // Cancelling twice is a 409; the ledger paid back the units.
    await request(app.getHttpServer())
      .post(`${ORDERS_BASE}/${placed.body.orderId}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(409);

    const readded = await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ variantId, quantity: 9 })
      .expect(201);
    // 10 on hand − 1 consumed by the second order = 9 available.
    expect(readded.body.available).toBe(9);
  });

  it('blocks checkout on shortages with 409 + available', async () => {
    const operator = await createUserWithToken();
    await prisma.role.findUniqueOrThrow({ where: { name: 'OPERATOR' } }).then((role) =>
      prisma.userRole.create({
        data: { userId: operator.userId, roleId: role.id, assignedBy: operator.userId },
      }),
    );
    const first = await createUserWithToken();
    const second = await createUserWithToken();
    const { variantId } = await seedPublishedVariant(
      operator.token,
      `رقابت ${uniqueSuffix()}`,
      1,
    );
    const firstAddress = await createAddress(first.token);
    const secondAddress = await createAddress(second.token);

    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set('Authorization', `Bearer ${first.token}`)
      .send({ variantId, quantity: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set('Authorization', `Bearer ${second.token}`)
      .send({ variantId, quantity: 1 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`${ORDERS_BASE}/checkout`)
      .set('Authorization', `Bearer ${first.token}`)
      .send({ addressId: firstAddress, paymentMethod: 'COD' })
      .expect(201);

    // The loser previews the shortage, then fails with the available count.
    const preview = await request(app.getHttpServer())
      .post(`${CHECKOUT_BASE}/validate`)
      .set('Authorization', `Bearer ${second.token}`)
      .send({})
      .expect(200);
    expect(preview.body.valid).toBe(false);
    expect(preview.body.problems[0]).toMatchObject({
      variantId,
      code: 'OUT_OF_STOCK',
      available: 0,
    });
    for (const problem of preview.body.problems) {
      expect(Object.keys(problem).sort()).toEqual(CHECKOUT_PROBLEM_KEYS);
    }

    await request(app.getHttpServer())
      .post(`${ORDERS_BASE}/checkout`)
      .set('Authorization', `Bearer ${second.token}`)
      .send({ addressId: secondAddress, paymentMethod: 'COD' })
      .expect(409)
      .then((res) => expect(res.body.available).toBe(0));
  });

  it('rejects empty carts, foreign addresses and foreign orders', async () => {
    const customer = await createUserWithToken();
    const other = await createUserWithToken();
    const addressId = await createAddress(customer.token);
    const otherAddressId = await createAddress(other.token);

    await request(app.getHttpServer())
      .post(`${ORDERS_BASE}/checkout`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ addressId: otherAddressId, paymentMethod: 'COD' })
      .expect(400);

    // Foreign address ids are non-disclosure 404s.
    await request(app.getHttpServer())
      .post(`${ORDERS_BASE}/checkout`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ addressId, paymentMethod: 'COD' })
      .expect(404);

    await request(app.getHttpServer())
      .post(`${CHECKOUT_BASE}/validate`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ addressId })
      .expect(404);

    // Foreign orders are invisible.
    const listed = await request(app.getHttpServer())
      .get(ORDERS_BASE)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(200);
    expect(listed.body).toEqual({ items: [], total: 0 });
  });

  it('hides other users\u2019 orders with 404', async () => {
    const operator = await createUserWithToken();
    await prisma.role.findUniqueOrThrow({ where: { name: 'OPERATOR' } }).then((role) =>
      prisma.userRole.create({
        data: { userId: operator.userId, roleId: role.id, assignedBy: operator.userId },
      }),
    );
    const owner = await createUserWithToken();
    const stranger = await createUserWithToken();
    const { variantId } = await seedPublishedVariant(
      operator.token,
      `حریم ${uniqueSuffix()}`,
      5,
    );
    const addressId = await createAddress(owner.token);
    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ variantId, quantity: 1 })
      .expect(201);
    const placed = await request(app.getHttpServer())
      .post(`${ORDERS_BASE}/checkout`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ addressId, paymentMethod: 'COD' })
      .expect(201);

    await request(app.getHttpServer())
      .get(`${ORDERS_BASE}/${placed.body.orderId}`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${ORDERS_BASE}/${placed.body.orderId}/cancel`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${ORDERS_BASE}/${placed.body.orderId}/invoice`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(404);
  });
});
