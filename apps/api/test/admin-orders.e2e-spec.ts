import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductCondition } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(120_000);

const ADMIN_BASE = '/api/v1/admin/orders';
const ORDERS_BASE = '/api/v1/orders';
const CART_BASE = '/api/v1/cart';
const ADDRESSES_BASE = '/api/v1/addresses';

/** DTO key pins — any shape change must update these lists. */
const ADMIN_ORDER_LIST_KEYS = ['items', 'total'];
const ADMIN_ORDER_LIST_ITEM_KEYS = [
  'createdAt',
  'customerMobile',
  'id',
  'itemCount',
  'orderNumber',
  'paymentMethod',
  'paymentStatus',
  'status',
  'statusFa',
  'total',
  'userId',
];
const ADMIN_ORDER_DETAIL_KEYS = [
  'addressSnapshot',
  'createdAt',
  'customerMobile',
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
  'userId',
];
const ADMIN_ORDER_ITEM_KEYS = [
  'lineTotal',
  'productName',
  'quantity',
  'sku',
  'unitPrice',
  'variantId',
  'variantName',
];

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
 * Operator order management API (SS-240A). Proves the admin contract:
 * anonymous callers get 401 everywhere, customers get 403, operators list
 * every row newest-first with owner + mobile + payment columns, detail
 * carries the admin keys, transitions enforce the legal lifecycle with
 * COD flipping to PAID exactly on DELIVERED, every transition writes one
 * ORDER_STATUS_CHANGED audit event, and illegal jumps/terminal moves 409.
 */
describe('Admin orders API (SS-240A) (e2e)', () => {
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
  const orderIds: string[] = [];

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

    return {
      productId: product.body.id as string,
      variantId: variant.body.id as string,
    };
  }

  async function placeCustomerOrder(
    customerToken: string,
    variantId: string,
    quantity: number,
  ): Promise<{ orderId: string; orderNumber: number }> {
    const address = await request(app.getHttpServer())
      .post(ADDRESSES_BASE)
      .set('Authorization', `Bearer ${customerToken}`)
      .send(ADDRESS_BODY)
      .expect(201);
    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity })
      .expect(201);
    const placed = await request(app.getHttpServer())
      .post(`${ORDERS_BASE}/checkout`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ addressId: address.body.id, paymentMethod: 'COD' })
      .expect(201);
    orderIds.push(placed.body.orderId as string);
    return {
      orderId: placed.body.orderId as string,
      orderNumber: placed.body.orderNumber as number,
    };
  }

  beforeAll(async () => {
    delete process.env.PAYMENTS_ONLINE_ENABLED;
    delete process.env.COD_ENABLED;

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
      where: { entityId: { in: orderIds } },
    });
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
    await prisma.user.deleteMany({ where: { mobile: { in: mobiles } } });
    await app.close();
  });

  it('rejects anonymous callers with 401 and customers with 403', async () => {
    const id = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    await request(app.getHttpServer()).get(ADMIN_BASE).expect(401);
    await request(app.getHttpServer()).get(`${ADMIN_BASE}/${id}`).expect(401);
    await request(app.getHttpServer())
      .patch(`${ADMIN_BASE}/${id}/status`)
      .send({ status: 'PROCESSING' })
      .expect(401);

    const customer = await createUserWithToken();
    await request(app.getHttpServer())
      .get(ADMIN_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${ADMIN_BASE}/${id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${ADMIN_BASE}/${id}/status`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ status: 'PROCESSING' })
      .expect(403);
  });

  it('lists every row with pinned admin keys and filters by status', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const customer = await createUserWithToken();
    const { variantId } = await seedPublishedVariant(
      operator.token,
      `سفارش مدیریت ${uniqueSuffix()}`,
      10,
    );
    const { orderId } = await placeCustomerOrder(customer.token, variantId, 2);

    const listed = await request(app.getHttpServer())
      .get(ADMIN_BASE)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200);
    expect(Object.keys(listed.body).sort()).toEqual(ADMIN_ORDER_LIST_KEYS);
    const row = (listed.body.items as Array<{ id: string }>).find(
      (item) => item.id === orderId,
    );
    expect(row).toBeDefined();
    expect(Object.keys(row!).sort()).toEqual(ADMIN_ORDER_LIST_ITEM_KEYS);
    expect(row).toMatchObject({
      id: orderId,
      userId: customer.userId,
      customerMobile: customer.mobile,
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      status: 'PENDING',
      statusFa: 'در انتظار بررسی',
      itemCount: 1,
      total: '10000',
    });

    const filtered = await request(app.getHttpServer())
      .get(`${ADMIN_BASE}?status=PENDING`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200);
    expect(
      (filtered.body.items as Array<{ id: string }>).some(
        (item) => item.id === orderId,
      ),
    ).toBe(true);

    const other = await request(app.getHttpServer())
      .get(`${ADMIN_BASE}?status=DELIVERED`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200);
    expect(
      (other.body.items as Array<{ id: string }>).some(
        (item) => item.id === orderId,
      ),
    ).toBe(false);
  });

  it('returns admin detail with pinned keys and 404s unknown ids', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const customer = await createUserWithToken();
    const { variantId } = await seedPublishedVariant(
      operator.token,
      `جزئیات مدیریت ${uniqueSuffix()}`,
      10,
    );
    const { orderId } = await placeCustomerOrder(customer.token, variantId, 1);

    const detail = await request(app.getHttpServer())
      .get(`${ADMIN_BASE}/${orderId}`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200);
    expect(Object.keys(detail.body).sort()).toEqual(ADMIN_ORDER_DETAIL_KEYS);
    expect(detail.body).toMatchObject({
      id: orderId,
      userId: customer.userId,
      customerMobile: customer.mobile,
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      status: 'PENDING',
    });
    expect(Object.keys(detail.body.items[0]).sort()).toEqual(
      ADMIN_ORDER_ITEM_KEYS,
    );

    await request(app.getHttpServer())
      .get(`${ADMIN_BASE}/3fa85f64-5717-4562-b3fc-2c963f66afa6`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(404);
  });

  it('walks the lifecycle to DELIVERED and flips COD to PAID with audit', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const customer = await createUserWithToken();
    const { variantId } = await seedPublishedVariant(
      operator.token,
      `چرخه مدیریت ${uniqueSuffix()}`,
      10,
    );
    const { orderId } = await placeCustomerOrder(customer.token, variantId, 1);

    for (const next of ['PROCESSING', 'SHIPPED'] as const) {
      const moved = await request(app.getHttpServer())
        .patch(`${ADMIN_BASE}/${orderId}/status`)
        .set('Authorization', `Bearer ${operator.token}`)
        .send({ status: next })
        .expect(200);
      expect(moved.body).toMatchObject({
        id: orderId,
        status: next,
        paymentStatus: 'PENDING',
      });
    }

    const delivered = await request(app.getHttpServer())
      .patch(`${ADMIN_BASE}/${orderId}/status`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ status: 'DELIVERED' })
      .expect(200);
    expect(delivered.body).toMatchObject({
      id: orderId,
      status: 'DELIVERED',
      paymentStatus: 'PAID',
    });

    const audit = await prisma.auditLog.findMany({
      where: { action: 'ORDER_STATUS_CHANGED', entityId: orderId },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.length).toBe(3);
    expect(audit[2]).toMatchObject({
      entity: 'Order',
      userId: operator.userId,
    });

    // Terminal state: no further moves.
    await request(app.getHttpServer())
      .patch(`${ADMIN_BASE}/${orderId}/status`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ status: 'CANCELLED' })
      .expect(409);
  });

  it('409s illegal jumps and 400s invalid input', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const customer = await createUserWithToken();
    const { variantId } = await seedPublishedVariant(
      operator.token,
      `پرش مدیریت ${uniqueSuffix()}`,
      10,
    );
    const { orderId } = await placeCustomerOrder(customer.token, variantId, 1);

    await request(app.getHttpServer())
      .patch(`${ADMIN_BASE}/${orderId}/status`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ status: 'DELIVERED' })
      .expect(409);

    await request(app.getHttpServer())
      .patch(`${ADMIN_BASE}/${orderId}/status`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ status: 'REFUNDED' })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`${ADMIN_BASE}/${orderId}/status`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({})
      .expect(400);

    // The order is untouched by the rejected moves.
    const detail = await request(app.getHttpServer())
      .get(`${ADMIN_BASE}/${orderId}`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200);
    expect(detail.body).toMatchObject({ status: 'PENDING' });
  });

  it('cancels from PROCESSING via the operator and restocks with audit', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const customer = await createUserWithToken();
    const { variantId } = await seedPublishedVariant(
      operator.token,
      `لغو مدیریت ${uniqueSuffix()}`,
      10,
    );
    const { orderId, orderNumber } = await placeCustomerOrder(
      customer.token,
      variantId,
      2,
    );

    await request(app.getHttpServer())
      .patch(`${ADMIN_BASE}/${orderId}/status`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ status: 'PROCESSING' })
      .expect(200);

    const cancelled = await request(app.getHttpServer())
      .patch(`${ADMIN_BASE}/${orderId}/status`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ status: 'CANCELLED' })
      .expect(200);
    expect(cancelled.body).toMatchObject({ id: orderId, status: 'CANCELLED' });

    const restock = await prisma.inventoryMovement.findFirst({
      where: { variantId, notes: `order-cancel:${orderNumber}` },
    });
    expect(restock).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'ORDER_STATUS_CHANGED', entityId: orderId },
    });
    expect(audit).toMatchObject({ entity: 'Order' });
  });
});
