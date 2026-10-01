import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductCondition } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const NOTIF_BASE = '/api/v1/notifications';
const ORDERS_BASE = '/api/v1/orders';
const ADMIN_ORDERS_BASE = '/api/v1/admin/orders';
const CART_BASE = '/api/v1/cart';
const ADDRESSES_BASE = '/api/v1/addresses';

/** DTO key pins — any shape change must update these lists. */
const NOTIF_LIST_KEYS = ['items', 'limit', 'page', 'total'];
const NOTIF_ITEM_KEYS = [
  'body',
  'createdAt',
  'entity',
  'entityId',
  'id',
  'readAt',
  'title',
  'type',
  'typeFa',
];
const UNREAD_COUNT_KEYS = ['unread'];

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
 * Notifications API (SS-243). Proves the owner contract: anonymous callers
 * get 401, placing an order emits an owner ORDER_PLACED row plus one
 * operator fan-out row, an operator status transition emits
 * ORDER_STATUS_CHANGED, list is newest-first with pinned keys +
 * unread-only filter, unread-count is pinned, mark-read is idempotent,
 * and other-user ids are non-disclosure 404s.
 */
describe('Notifications API (SS-243) (e2e)', () => {
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

  let operatorToken: string;
  let customerToken: string;

  async function seedRole(name: string): Promise<void> {
    const existing = await prisma.role.findUnique({ where: { name } });
    if (existing) return;
    try {
      await prisma.role.create({ data: { name } });
    } catch {
      // Raced with a parallel suite — the row exists now.
    }
  }

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
      const roleRow = await prisma.role.findUniqueOrThrow({
        where: { name: role },
      });
      await prisma.userRole.create({
        data: { userId: user.id, roleId: roleRow.id, assignedBy: user.id },
      });
    }
    const tokens = await tokenService.createSession(user.id);
    return { userId: user.id, token: tokens.accessToken };
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
    ({ token: operatorToken } = await createUserWithToken('OPERATOR'));
    ({ token: customerToken } = await createUserWithToken());

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
        name: `کالای اعلان ${suffix}`,
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

    const address = await request(app.getHttpServer())
      .post(ADDRESSES_BASE)
      .set('Authorization', `Bearer ${customerToken}`)
      .send(ADDRESS_BODY)
      .expect(201);
    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId: variant.body.id, quantity: 1 })
      .expect(201);
    const placed = await request(app.getHttpServer())
      .post(`${ORDERS_BASE}/checkout`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        addressId: address.body.id,
        paymentMethod: 'COD',
        shippingMethod: 'STORE_PICKUP',
      })
      .expect(201);
    orderIds.push(placed.body.orderId as string);
    await request(app.getHttpServer())
      .patch(`${ADMIN_ORDERS_BASE}/${placed.body.orderId}/status`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ status: 'PROCESSING' })
      .expect(200);
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: orderIds } },
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
    await prisma.productVariant.deleteMany({
      where: { id: { in: variantIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: brandIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.warehouse.deleteMany({
      where: { id: { in: warehouseIds } },
    });
    await prisma.userSession.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { mobile: { in: mobiles } } });
    await app.close();
  });

  it('rejects anonymous callers with 401', async () => {
    await request(app.getHttpServer()).get(NOTIF_BASE).expect(401);
    await request(app.getHttpServer())
      .get(`${NOTIF_BASE}/unread-count`)
      .expect(401);
    await request(app.getHttpServer())
      .patch(`${NOTIF_BASE}/00000000-0000-4000-8000-000000000000/read`)
      .expect(401);
  });

  it('emits owner + operator rows on placement and transition', async () => {
    const customer = await request(app.getHttpServer())
      .get(NOTIF_BASE)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const customerTypes = (customer.body.items as Array<{ type: string }>).map(
      (item) => item.type,
    );
    expect(customerTypes).toContain('ORDER_PLACED');
    expect(customerTypes).toContain('ORDER_STATUS_CHANGED');
    expect(
      customer.body.items.every(
        (item: { entity: string; entityId: string }) =>
          item.entity === 'Order' && item.entityId === orderIds[0],
      ),
    ).toBe(true);

    const operator = await request(app.getHttpServer())
      .get(NOTIF_BASE)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    const operatorPlaced = (
      operator.body.items as Array<{ type: string; entityId: string }>
    ).filter((item) => item.type === 'ORDER_PLACED');
    expect(
      operatorPlaced.some((item) => item.entityId === orderIds[0]),
    ).toBe(true);
  });

  it('lists newest-first with pinned keys and unread-only filter', async () => {
    const list = await request(app.getHttpServer())
      .get(NOTIF_BASE)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(Object.keys(list.body).sort()).toEqual(NOTIF_LIST_KEYS);
    expect(list.body.items.length).toBeGreaterThanOrEqual(2);
    for (const item of list.body.items) {
      expect(Object.keys(item).sort()).toEqual(NOTIF_ITEM_KEYS);
    }
    const dates = (list.body.items as Array<{ createdAt: string }>).map(
      (item) => item.createdAt,
    );
    expect([...dates].sort().reverse()).toEqual(dates);

    const unreadOnly = await request(app.getHttpServer())
      .get(`${NOTIF_BASE}?unreadOnly=true`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(
      (unreadOnly.body.items as Array<{ readAt: string | null }>).every(
        (item) => item.readAt === null,
      ),
    ).toBe(true);

    const count = await request(app.getHttpServer())
      .get(`${NOTIF_BASE}/unread-count`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(Object.keys(count.body).sort()).toEqual(UNREAD_COUNT_KEYS);
    expect(count.body.unread).toBe(unreadOnly.body.total);
  });

  it('marks read idempotently and 404s other-user rows', async () => {
    const list = await request(app.getHttpServer())
      .get(`${NOTIF_BASE}?unreadOnly=true`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const firstId = list.body.items[0].id as string;

    const marked = await request(app.getHttpServer())
      .patch(`${NOTIF_BASE}/${firstId}/read`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(marked.body.readAt).not.toBeNull();
    await request(app.getHttpServer())
      .patch(`${NOTIF_BASE}/${firstId}/read`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    const after = await request(app.getHttpServer())
      .get(`${NOTIF_BASE}/unread-count`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(after.body.unread).toBe(list.body.total - 1);

    // Other-user row: the operator's fan-out copy is invisible to the customer.
    const operatorList = await request(app.getHttpServer())
      .get(NOTIF_BASE)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    const operatorRowId = (
      operatorList.body.items as Array<{ id: string; entityId: string }>
    ).find((item) => item.entityId === orderIds[0])!.id;
    await request(app.getHttpServer())
      .patch(`${NOTIF_BASE}/${operatorRowId}/read`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`${NOTIF_BASE}/not-a-uuid/read`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(400);
  });
});
