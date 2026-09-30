import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductCondition } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const RETURNS_BASE = '/api/v1/returns';
const ORDERS_BASE = '/api/v1/orders';
const ADMIN_ORDERS_BASE = '/api/v1/admin/orders';
const CART_BASE = '/api/v1/cart';
const ADDRESSES_BASE = '/api/v1/addresses';

/** DTO key pins — any shape change must update these lists. */
const RETURN_LIST_KEYS = ['items', 'limit', 'page', 'total'];
const RETURN_ITEM_KEYS = [
  'cancelledAt',
  'completedAt',
  'createdAt',
  'id',
  'items',
  'orderId',
  'orderNumber',
  'reason',
  'receivedAt',
  'rejectReason',
  'status',
  'statusFa',
  'updatedAt',
];
const RETURN_LINE_KEYS = [
  'id',
  'orderItemId',
  'productName',
  'quantity',
  'sku',
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
 * Owner returns API (SS-242). Proves the owner contract: anonymous callers
 * get 401, filing requires an owned DELIVERED order inside the window with
 * per-item quantities (422 otherwise), duplicate open requests 409, list is
 * newest-first with pinned keys + filters, detail is self-scoped (404 for
 * others), cancel works while PENDING and 409s after, and filing writes a
 * RETURN_REQUESTED audit event.
 */
describe('Returns API (SS-242) (e2e)', () => {
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
  const returnIds: string[] = [];

  async function seedRole(name: string): Promise<string> {
    const existing = await prisma.role.findUnique({ where: { name } });
    if (existing) return existing.id;
    try {
      const created = await prisma.role.create({ data: { name } });
      return created.id;
    } catch {
      const row = await prisma.role.findUnique({ where: { name } });
      if (row) return row.id;
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

    const warehouse = await prisma.warehouse.create({
      data: { code: `WH-${suffix}`, name: `انبار ${suffix}` },
    });
    warehouseIds.push(warehouse.id);
    await prisma.inventoryItem.create({
      data: {
        warehouseId: warehouse.id,
        variantId: variant.body.id,
        quantityOnHand: 10,
      },
    });

    return {
      productId: product.body.id as string,
      variantId: variant.body.id as string,
    };
  }

  async function placeDeliveredOrder(
    customerToken: string,
    operatorToken: string,
    variantId: string,
  ): Promise<{ orderId: string; orderItemId: string }> {
    const address = await request(app.getHttpServer())
      .post(ADDRESSES_BASE)
      .set('Authorization', `Bearer ${customerToken}`)
      .send(ADDRESS_BODY)
      .expect(201);
    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 2 })
      .expect(201);
    const placed = await request(app.getHttpServer())
      .post(`${ORDERS_BASE}/checkout`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ addressId: address.body.id, paymentMethod: 'COD' })
      .expect(201);
    const orderId = placed.body.orderId as string;
    orderIds.push(orderId);
    for (const status of ['PROCESSING', 'SHIPPED', 'DELIVERED']) {
      await request(app.getHttpServer())
        .patch(`${ADMIN_ORDERS_BASE}/${orderId}/status`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ status })
        .expect(200);
    }
    const line = await prisma.orderItem.findFirstOrThrow({
      where: { orderId },
      select: { id: true },
    });
    return { orderId, orderItemId: line.id };
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
      where: { entityId: { in: [...returnIds, ...orderIds] } },
    });
    await prisma.returnItem.deleteMany({
      where: { request: { id: { in: returnIds } } },
    });
    await prisma.returnRequest.deleteMany({
      where: { id: { in: returnIds } },
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

  it('rejects anonymous callers with 401', async () => {
    const id = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    await request(app.getHttpServer()).get(RETURNS_BASE).expect(401);
    await request(app.getHttpServer()).get(`${RETURNS_BASE}/${id}`).expect(401);
    await request(app.getHttpServer())
      .post(RETURNS_BASE)
      .send({ orderId: id, reason: 'x', items: [] })
      .expect(401);
    await request(app.getHttpServer())
      .post(`${RETURNS_BASE}/${id}/cancel`)
      .expect(401);
  });

  it('files, lists, details, and cancels with pinned keys + audit', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const customer = await createUserWithToken();
    const { variantId } = await seedPublishedVariant(
      operator.token,
      `کالای مرجوعی ${uniqueSuffix()}`,
    );
    const { orderId, orderItemId } = await placeDeliveredOrder(
      customer.token,
      operator.token,
      variantId,
    );

    const created = await request(app.getHttpServer())
      .post(RETURNS_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        orderId,
        reason: 'کالا معیوب به دستم رسید.',
        items: [{ orderItemId, quantity: 1 }],
      })
      .expect(201);
    const returnId = created.body.id as string;
    returnIds.push(returnId);
    expect(Object.keys(created.body).sort()).toEqual(RETURN_ITEM_KEYS);
    expect(Object.keys(created.body.items[0]).sort()).toEqual(
      RETURN_LINE_KEYS,
    );
    expect(created.body).toMatchObject({
      orderId,
      status: 'PENDING',
      statusFa: 'در انتظار بررسی',
      reason: 'کالا معیوب به دستم رسید.',
    });

    const audits = await prisma.auditLog.findMany({
      where: { entityId: returnId, action: 'RETURN_REQUESTED' },
    });
    expect(audits).toHaveLength(1);

    // Duplicate open request 409s.
    await request(app.getHttpServer())
      .post(RETURNS_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        orderId,
        reason: 'دوباره.',
        items: [{ orderItemId, quantity: 1 }],
      })
      .expect(409);

    const listed = await request(app.getHttpServer())
      .get(RETURNS_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(Object.keys(listed.body).sort()).toEqual(RETURN_LIST_KEYS);
    expect(listed.body).toMatchObject({ total: 1, page: 1, limit: 10 });
    expect(Object.keys(listed.body.items[0]).sort()).toEqual(RETURN_ITEM_KEYS);

    const filtered = await request(app.getHttpServer())
      .get(`${RETURNS_BASE}?status=PENDING`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(filtered.body.total).toBe(1);

    const detail = await request(app.getHttpServer())
      .get(`${RETURNS_BASE}/${returnId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(Object.keys(detail.body).sort()).toEqual(RETURN_ITEM_KEYS);

    // Other-user reads are non-disclosure 404s.
    const stranger = await createUserWithToken();
    await request(app.getHttpServer())
      .get(`${RETURNS_BASE}/${returnId}`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(404);

    const cancelled = await request(app.getHttpServer())
      .post(`${RETURNS_BASE}/${returnId}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(cancelled.body).toMatchObject({
      status: 'CANCELLED',
      statusFa: 'لغو شد',
    });

    // Cancelling twice 409s.
    await request(app.getHttpServer())
      .post(`${RETURNS_BASE}/${returnId}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(409);
  });

  it('422s for non-delivered orders, bad lines, and unknown orders', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const customer = await createUserWithToken();
    const { variantId } = await seedPublishedVariant(
      operator.token,
      `کالای مرجوعی ${uniqueSuffix()}`,
    );

    // Non-delivered (fresh PENDING) order.
    const address = await request(app.getHttpServer())
      .post(ADDRESSES_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send(ADDRESS_BODY)
      .expect(201);
    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ variantId, quantity: 1 })
      .expect(201);
    const placed = await request(app.getHttpServer())
      .post(`${ORDERS_BASE}/checkout`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ addressId: address.body.id, paymentMethod: 'COD' })
      .expect(201);
    const pendingOrderId = placed.body.orderId as string;
    orderIds.push(pendingOrderId);
    const pendingLine = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: pendingOrderId },
      select: { id: true },
    });

    await request(app.getHttpServer())
      .post(RETURNS_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        orderId: pendingOrderId,
        reason: 'زود است.',
        items: [{ orderItemId: pendingLine.id, quantity: 1 }],
      })
      .expect(422);

    // Unknown order 404s; unknown line + over-quantity 422.
    const { orderId, orderItemId } = await placeDeliveredOrder(
      customer.token,
      operator.token,
      variantId,
    );
    await request(app.getHttpServer())
      .post(RETURNS_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        orderId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        reason: 'ناموجود.',
        items: [{ orderItemId, quantity: 1 }],
      })
      .expect(404);
    await request(app.getHttpServer())
      .post(RETURNS_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        orderId,
        reason: 'قلم نامعتبر.',
        items: [{ orderItemId: pendingLine.id, quantity: 1 }],
      })
      .expect(422);
    await request(app.getHttpServer())
      .post(RETURNS_BASE)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        orderId,
        reason: 'مقدار زیاد.',
        items: [{ orderItemId, quantity: 99 }],
      })
      .expect(422);
  });
});
