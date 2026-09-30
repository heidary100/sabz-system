import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductCondition } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(120_000);

const RFQ_BASE = '/api/v1/rfq';
const ADDRESSES_BASE = '/api/v1/addresses';
const CART_BASE = '/api/v1/cart';
const ORDERS_BASE = '/api/v1/orders';

/** DTO key pins — any shape change must update these lists. */
const RFQ_KEYS = [
  'createdAt',
  'expiresAt',
  'id',
  'orderId',
  'productName',
  'productSlug',
  'quantity',
  'quotedLineTotal',
  'quotedUnitPrice',
  'status',
  'statusFa',
  'variantId',
  'variantSku',
];
const RFQ_LIST_KEYS = ['items', 'total'];
const PLACE_ORDER_KEYS = ['orderId', 'orderNumber', 'status', 'total'];

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
 * RFQ workflow API (SS-235 B2, pricing-engine.md §6 + §8). Proves the
 * partner-only contract: anonymous callers get 401 everywhere, retail
 * customers get 403 on create, PRICED variants are rejected with 422
 * (RFQ is call-for-price only), the operator quotes a pending request,
 * the partner accepts inside the window into a frozen-price order
 * (double-accept replays the order), lapsed quotations 410, cross-user
 * reads 404, cart/checkout stay closed to CALL_FOR_PRICE (PRICE-008),
 * and every transition writes an audit event.
 */
describe('RFQ API (SS-235 B2) (e2e)', () => {
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
  const tierIds: string[] = [];
  const partnerIds: string[] = [];
  const rfqIds: string[] = [];

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

  async function assignRole(userId: string, roleName: string): Promise<void> {
    const roleId = await seedRole(roleName);
    await prisma.userRole.create({ data: { userId, roleId } });
  }

  async function createUserWithToken(
    operator: boolean,
  ): Promise<{ userId: string; token: string }> {
    const mobile = uniqueMobile();
    mobiles.push(mobile);
    const user = await prisma.user.create({
      data: { mobile, status: 'ACTIVE' },
    });
    userIds.push(user.id);
    if (operator) {
      await assignRole(user.id, 'OPERATOR');
    }
    const tokens = await tokenService.createSession(user.id);
    return { userId: user.id, token: tokens.accessToken };
  }

  async function createApprovedPartner(
    userId: string,
  ): Promise<void> {
    const suffix = uniqueSuffix();
    const tier = await prisma.partnerTier.create({
      data: { name: `سطح ${suffix}`, discountPercent: 10, minOrderQuantity: 1 },
    });
    tierIds.push(tier.id);
    const profile = await prisma.userProfile.create({
      data: { userId, firstName: 'شریک', lastName: 'تجاری' },
    });
    const partner = await prisma.partner.create({
      data: {
        profileId: profile.id,
        businessName: `کسب ${suffix}`,
        approvalStatus: 'APPROVED',
        tierId: tier.id,
      },
    });
    partnerIds.push(partner.id);
  }

  async function seedCallForPriceVariant(
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
      .send({ sku: `SKU-${suffix}`, price: '0', priceStatus: 'CALL_FOR_PRICE' })
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
    await prisma.rfq.deleteMany({ where: { id: { in: rfqIds } } });
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
    await prisma.partner.deleteMany({ where: { id: { in: partnerIds } } });
    await prisma.partnerTier.deleteMany({ where: { id: { in: tierIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: userIds } },
          { entityId: { in: rfqIds } },
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

  it('rejects anonymous callers with 401 on every route', async () => {
    const id = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    await request(app.getHttpServer()).post(RFQ_BASE).send({}).expect(401);
    await request(app.getHttpServer()).get(RFQ_BASE).expect(401);
    await request(app.getHttpServer()).get(`${RFQ_BASE}/${id}`).expect(401);
    await request(app.getHttpServer())
      .patch(`${RFQ_BASE}/${id}/quote`)
      .send({})
      .expect(401);
    await request(app.getHttpServer()).post(`${RFQ_BASE}/${id}/reject`).send({}).expect(401);
    await request(app.getHttpServer())
      .post(`${RFQ_BASE}/${id}/accept`)
      .send({})
      .expect(401);
  });

  it('runs the full request → quote → accept flow with a frozen price', async () => {
    const operator = await createUserWithToken(true);
    const partner = await createUserWithToken(false);
    await createApprovedPartner(partner.userId);
    const { variantId } = await seedCallForPriceVariant(
      operator.token,
      `مدل بدون قیمت ${uniqueSuffix()}`,
      50,
    );

    // Partner files the request: PENDING, no price yet.
    const created = await request(app.getHttpServer())
      .post(RFQ_BASE)
      .set('Authorization', `Bearer ${partner.token}`)
      .send({ variantId, quantity: 5 })
      .expect(201);
    expect(Object.keys(created.body).sort()).toEqual(RFQ_KEYS);
    expect(created.body).toMatchObject({
      variantId,
      quantity: 5,
      status: 'PENDING',
      statusFa: 'در انتظار استعلام',
      quotedUnitPrice: null,
      quotedLineTotal: null,
      orderId: null,
    });
    const rfqId = created.body.id as string;
    rfqIds.push(rfqId);

    // Operator sees it in the quoting queue; the partner sees their own row.
    const queue = await request(app.getHttpServer())
      .get(`${RFQ_BASE}?status=PENDING`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200);
    expect(Object.keys(queue.body).sort()).toEqual(RFQ_LIST_KEYS);
    expect(queue.body.items.map((row: { id: string }) => row.id)).toContain(rfqId);

    const mine = await request(app.getHttpServer())
      .get(RFQ_BASE)
      .set('Authorization', `Bearer ${partner.token}`)
      .expect(200);
    expect(mine.body.items).toHaveLength(1);

    // Accept before any quote is a 409 — nothing to freeze yet.
    await request(app.getHttpServer())
      .post(`${RFQ_BASE}/${rfqId}/accept`)
      .set('Authorization', `Bearer ${partner.token}`)
      .send({ addressId: '3fa85f64-5717-4562-b3fc-2c963f66afa6', paymentMethod: 'COD', shippingMethod: 'STORE_PICKUP' })
      .expect(409);

    // Operator quotes: QUOTED with the agreed unit and line total.
    const quoted = await request(app.getHttpServer())
      .patch(`${RFQ_BASE}/${rfqId}/quote`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ unitPrice: '900.00' })
      .expect(200);
    expect(Object.keys(quoted.body).sort()).toEqual(RFQ_KEYS);
    expect(quoted.body).toMatchObject({
      status: 'QUOTED',
      statusFa: 'قیمت اعلام شد',
      quotedUnitPrice: '900',
      quotedLineTotal: '4500',
    });

    // A second quote is a 409 — the agreement stands.
    await request(app.getHttpServer())
      .patch(`${RFQ_BASE}/${rfqId}/quote`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ unitPrice: '800.00' })
      .expect(409);

    // Partner accepts: a PENDING order frozen at 5 × 900.
    const addressId = await createAddress(partner.token);
    const accepted = await request(app.getHttpServer())
      .post(`${RFQ_BASE}/${rfqId}/accept`)
      .set('Authorization', `Bearer ${partner.token}`)
      .send({ addressId, paymentMethod: 'COD', shippingMethod: 'STORE_PICKUP' })
      .expect(201);
    expect(Object.keys(accepted.body).sort()).toEqual(PLACE_ORDER_KEYS);
    expect(accepted.body).toMatchObject({ status: 'PENDING', total: '4500' });

    const detail = await request(app.getHttpServer())
      .get(`${ORDERS_BASE}/${accepted.body.orderId as string}`)
      .set('Authorization', `Bearer ${partner.token}`)
      .expect(200);
    expect(detail.body.total).toBe('4500');
    expect(detail.body.items[0]).toMatchObject({
      variantId,
      quantity: 5,
      unitPrice: '900',
      lineTotal: '4500',
    });

    const settled = await request(app.getHttpServer())
      .get(`${RFQ_BASE}/${rfqId}`)
      .set('Authorization', `Bearer ${partner.token}`)
      .expect(200);
    expect(settled.body).toMatchObject({
      status: 'ACCEPTED',
      orderId: accepted.body.orderId,
    });

    // Double-accept replays the same order instead of double-selling.
    const replay = await request(app.getHttpServer())
      .post(`${RFQ_BASE}/${rfqId}/accept`)
      .set('Authorization', `Bearer ${partner.token}`)
      .send({ addressId, paymentMethod: 'COD', shippingMethod: 'STORE_PICKUP' })
      .expect(201);
    expect(replay.body.orderId).toBe(accepted.body.orderId);

    // Audit trail covers the lifecycle (spec §11).
    const events = await prisma.auditLog.findMany({
      where: { entity: 'Rfq', entityId: rfqId },
      select: { action: true },
    });
    expect(events.map((row) => row.action).sort()).toEqual(
      ['RFQ_ACCEPTED', 'RFQ_CREATED', 'RFQ_QUOTED'].sort(),
    );
  });

  it('rejects retail customers with 403 and priced variants with 422', async () => {
    const operator = await createUserWithToken(true);
    const retail = await createUserWithToken(false);
    const partner = await createUserWithToken(false);
    await createApprovedPartner(partner.userId);
    const { variantId } = await seedCallForPriceVariant(
      operator.token,
      `مدل بدون قیمت ${uniqueSuffix()}`,
      10,
    );

    // Retail (no approved partner record) cannot file.
    await request(app.getHttpServer())
      .post(RFQ_BASE)
      .set('Authorization', `Bearer ${retail.token}`)
      .send({ variantId, quantity: 1 })
      .expect(403);

    // Partners cannot file against PRICED variants — RFQ is call-for-price only.
    const suffix = uniqueSuffix();
    const brand = await prisma.brand.create({
      data: { name: `برند ${suffix}`, slug: `brand-${suffix}` },
    });
    brandIds.push(brand.id);
    const category = await prisma.category.create({
      data: { name: `دسته ${suffix}`, slug: `cat-${suffix}` },
    });
    categoryIds.push(category.id);
    const priced = await prisma.product.create({
      data: {
        name: `مدل قیمت‌دار ${suffix}`,
        slug: `priced-${suffix}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
        status: 'PUBLISHED',
      },
    });
    productIds.push(priced.id);
    const pricedVariant = await prisma.productVariant.create({
      data: { productId: priced.id, sku: `SKU-P-${suffix}`, price: '5000' },
    });
    variantIds.push(pricedVariant.id);

    await request(app.getHttpServer())
      .post(RFQ_BASE)
      .set('Authorization', `Bearer ${partner.token}`)
      .send({ variantId: pricedVariant.id, quantity: 1 })
      .expect(422);
  });

  it('hides other users\u2019 rows with 404 and keeps operator reads working', async () => {
    const operator = await createUserWithToken(true);
    const partner = await createUserWithToken(false);
    const stranger = await createUserWithToken(false);
    await createApprovedPartner(partner.userId);
    const { variantId } = await seedCallForPriceVariant(
      operator.token,
      `مدل بدون قیمت ${uniqueSuffix()}`,
      10,
    );

    const created = await request(app.getHttpServer())
      .post(RFQ_BASE)
      .set('Authorization', `Bearer ${partner.token}`)
      .send({ variantId, quantity: 2 })
      .expect(201);
    rfqIds.push(created.body.id as string);

    await request(app.getHttpServer())
      .get(`${RFQ_BASE}/${created.body.id as string}`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(404);

    // Operator quoting is OPERATOR/ADMIN-only: partners get 403.
    await request(app.getHttpServer())
      .patch(`${RFQ_BASE}/${created.body.id as string}/quote`)
      .set('Authorization', `Bearer ${partner.token}`)
      .send({ unitPrice: '700.00' })
      .expect(403);

    await request(app.getHttpServer())
      .get(`${RFQ_BASE}/${created.body.id as string}`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200)
      .then((res) => {
        expect(Object.keys(res.body).sort()).toEqual(RFQ_KEYS);
      });
  });

  it('expires lapsed quotations with 410 and keeps cart closed (PRICE-008)', async () => {
    const operator = await createUserWithToken(true);
    const partner = await createUserWithToken(false);
    await createApprovedPartner(partner.userId);
    const { variantId } = await seedCallForPriceVariant(
      operator.token,
      `مدل بدون قیمت ${uniqueSuffix()}`,
      10,
    );

    const created = await request(app.getHttpServer())
      .post(RFQ_BASE)
      .set('Authorization', `Bearer ${partner.token}`)
      .send({ variantId, quantity: 3 })
      .expect(201);
    const rfqId = created.body.id as string;
    rfqIds.push(rfqId);

    await request(app.getHttpServer())
      .patch(`${RFQ_BASE}/${rfqId}/quote`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ unitPrice: '750.00' })
      .expect(200);

    // Lapse the window server-side, then accept: 410 + EXPIRED.
    await prisma.rfq.update({
      where: { id: rfqId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const addressId = await createAddress(partner.token);
    await request(app.getHttpServer())
      .post(`${RFQ_BASE}/${rfqId}/accept`)
      .set('Authorization', `Bearer ${partner.token}`)
      .send({ addressId, paymentMethod: 'COD', shippingMethod: 'STORE_PICKUP' })
      .expect(410);

    const settled = await request(app.getHttpServer())
      .get(`${RFQ_BASE}/${rfqId}`)
      .set('Authorization', `Bearer ${partner.token}`)
      .expect(200);
    expect(settled.body.status).toBe('EXPIRED');

    // PRICE-008 intact: the variant still cannot enter the cart.
    await request(app.getHttpServer())
      .post(`${CART_BASE}/items`)
      .set('Authorization', `Bearer ${partner.token}`)
      .send({ variantId, quantity: 1 })
      .expect(422);
  });
});
