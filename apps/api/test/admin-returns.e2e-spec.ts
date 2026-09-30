import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductCondition } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const ADMIN_BASE = '/api/v1/admin/returns';
const RETURNS_BASE = '/api/v1/returns';
const ORDERS_BASE = '/api/v1/orders';
const ADMIN_ORDERS_BASE = '/api/v1/admin/orders';
const CART_BASE = '/api/v1/cart';
const ADDRESSES_BASE = '/api/v1/addresses';

/** DTO key pins — any shape change must update these lists. */
const ADMIN_RETURN_LIST_KEYS = ['items', 'limit', 'page', 'total'];
const ADMIN_RETURN_ITEM_KEYS = [
  'cancelledAt',
  'completedAt',
  'createdAt',
  'customerMobile',
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
  'userId',
];
const ADMIN_RETURN_LINE_KEYS = [
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
 * Operator returns queue (SS-242). Proves the admin contract: anonymous
 * callers get 401, customers get 403, the queue defaults to the PENDING
 * worklist newest-first with owner identity, the status filter + pagination
 * work, the full lifecycle approve → receive → complete writes one audit
 * per transition, reject requires a reason, and illegal transitions 409.
 */
describe('Admin returns API (SS-242) (e2e)', () => {
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
      .send({ variantId, quantity: 1 })
      .expect(201);
    const placed = await request(app.getHttpServer())
      .post(`${ORDERS_BASE}/checkout`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ addressId: address.body.id, paymentMethod: 'COD', shippingMethod: 'STORE_PICKUP' })
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

  async function fileReturn(
    customerToken: string,
    orderId: string,
    orderItemId: string,
  ): Promise<string> {
    const created = await request(app.getHttpServer())
      .post(RETURNS_BASE)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId,
        reason: 'کالا معیوب است.',
        items: [{ orderItemId, quantity: 1 }],
      })
      .expect(201);
    const id = created.body.id as string;
    returnIds.push(id);
    return id;
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

  it('rejects anonymous callers with 401 and customers with 403', async () => {
    const id = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    await request(app.getHttpServer()).get(ADMIN_BASE).expect(401);
    await request(app.getHttpServer()).get(`${ADMIN_BASE}/${id}`).expect(401);
    await request(app.getHttpServer())
      .post(`${ADMIN_BASE}/${id}/approve`)
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
      .post(`${ADMIN_BASE}/${id}/approve`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(403);
  });

  it('lists the PENDING queue with pinned keys + filters + pagination', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const customer = await createUserWithToken();
    const { variantId } = await seedPublishedVariant(
      operator.token,
      `کالای ادمین ${uniqueSuffix()}`,
    );
    const { orderId, orderItemId } = await placeDeliveredOrder(
      customer.token,
      operator.token,
      variantId,
    );
    await fileReturn(customer.token, orderId, orderItemId);

    const queued = await request(app.getHttpServer())
      .get(ADMIN_BASE)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200);
    expect(Object.keys(queued.body).sort()).toEqual(ADMIN_RETURN_LIST_KEYS);
    expect(queued.body).toMatchObject({ page: 1, limit: 20 });
    expect(queued.body.total).toBeGreaterThanOrEqual(1);
    expect(Object.keys(queued.body.items[0]).sort()).toEqual(
      ADMIN_RETURN_ITEM_KEYS,
    );
    expect(Object.keys(queued.body.items[0].items[0]).sort()).toEqual(
      ADMIN_RETURN_LINE_KEYS,
    );
    expect(queued.body.items[0]).toMatchObject({
      userId: customer.userId,
      customerMobile: customer.mobile,
    });

    const newest = queued.body.items.map(
      (row: { createdAt: string }) => row.createdAt,
    );
    expect([...newest].sort().reverse()).toEqual(newest);

    const approved = await request(app.getHttpServer())
      .get(`${ADMIN_BASE}?status=APPROVED`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200);
    expect(approved.body.total).toBe(0);

    await request(app.getHttpServer())
      .get(`${ADMIN_BASE}?status=BOGUS`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(400);
  });

  it('walks approve → receive → complete with one audit per transition', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const customer = await createUserWithToken();
    const { variantId } = await seedPublishedVariant(
      operator.token,
      `کالای چرخه ${uniqueSuffix()}`,
    );
    const { orderId, orderItemId } = await placeDeliveredOrder(
      customer.token,
      operator.token,
      variantId,
    );
    const id = await fileReturn(customer.token, orderId, orderItemId);

    const detail = await request(app.getHttpServer())
      .get(`${ADMIN_BASE}/${id}`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200);
    expect(Object.keys(detail.body).sort()).toEqual(ADMIN_RETURN_ITEM_KEYS);

    const approvedRes = await request(app.getHttpServer())
      .post(`${ADMIN_BASE}/${id}/approve`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200);
    expect(approvedRes.body).toMatchObject({
      status: 'APPROVED',
      statusFa: 'تأیید شد',
    });

    // Double-approve 409s.
    await request(app.getHttpServer())
      .post(`${ADMIN_BASE}/${id}/approve`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(409);

    const receivedRes = await request(app.getHttpServer())
      .post(`${ADMIN_BASE}/${id}/receive`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200);
    expect(receivedRes.body).toMatchObject({
      status: 'RECEIVED',
      statusFa: 'دریافت شد',
    });

    const completedRes = await request(app.getHttpServer())
      .post(`${ADMIN_BASE}/${id}/complete`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200);
    expect(completedRes.body).toMatchObject({
      status: 'COMPLETED',
      statusFa: 'تکمیل شد',
    });

    const audits = await prisma.auditLog.findMany({
      where: { entityId: id },
      select: { action: true },
    });
    const actions = audits.map((row) => row.action).sort();
    expect(actions).toEqual(
      ['RETURN_APPROVED', 'RETURN_COMPLETED', 'RETURN_RECEIVED', 'RETURN_REQUESTED'].sort(),
    );
  });

  it('rejects with a reason and 400s/409s the bad paths', async () => {
    const operator = await createUserWithToken('OPERATOR');
    const customer = await createUserWithToken();
    const { variantId } = await seedPublishedVariant(
      operator.token,
      `کالای رد ${uniqueSuffix()}`,
    );
    const { orderId, orderItemId } = await placeDeliveredOrder(
      customer.token,
      operator.token,
      variantId,
    );
    const id = await fileReturn(customer.token, orderId, orderItemId);

    await request(app.getHttpServer())
      .post(`${ADMIN_BASE}/${id}/reject`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({})
      .expect(400);

    const rejected = await request(app.getHttpServer())
      .post(`${ADMIN_BASE}/${id}/reject`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ reason: 'مهلت مرجوعی تمام شده است.' })
      .expect(200);
    expect(rejected.body).toMatchObject({
      status: 'REJECTED',
      statusFa: 'رد شد',
      rejectReason: 'مهلت مرجوعی تمام شده است.',
    });

    // Terminal rows reject further transitions.
    await request(app.getHttpServer())
      .post(`${ADMIN_BASE}/${id}/approve`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(409);
    await request(app.getHttpServer())
      .post(`${ADMIN_BASE}/${id}/receive`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(409);

    await request(app.getHttpServer())
      .get(`${ADMIN_BASE}/3fa85f64-5717-4562-b3fc-2c963f66afa6`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(404);
  });
});
