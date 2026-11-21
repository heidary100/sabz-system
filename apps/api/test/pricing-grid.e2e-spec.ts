import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PartnerApprovalStatus,
  Prisma,
  ProductCondition,
  ProductStatus,
  UserStatus,
} from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(120_000);

const BULK = '/api/v1/admin/pricing/bulk';
const CURRENCY = '/api/v1/admin/currency-rates';

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Endpoint-level proof for the pricing workspace: authorization, preview →
 * apply contract, category-rule scope, FX recalculation, and HTTP-level B2B
 * price non-disclosure. The financial math is covered against PostgreSQL in
 * `pricing-grid.integration-spec.ts`; this suite proves the real HTTP surface.
 */
describe('Pricing workspace API (pricing-grid spec) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;

  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const productIds: string[] = [];
  const variantIds: string[] = [];
  const partnerIds: string[] = [];
  const rateIds: string[] = [];

  async function roleId(name: string): Promise<string> {
    const existing = await prisma.role.findUnique({ where: { name } });
    if (existing) return existing.id;
    return (await prisma.role.create({ data: { name } })).id;
  }

  async function userWithRole(
    role?: 'ADMIN' | 'OPERATOR' | 'PARTNER' | 'CUSTOMER',
  ): Promise<{ id: string; token: string }> {
    const mobile = `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
    const user = await prisma.user.create({
      data: { mobile, status: UserStatus.ACTIVE },
    });
    userIds.push(user.id);
    if (role) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: await roleId(role), assignedBy: user.id },
      });
    }
    const session = await tokens.createSession(user.id);
    return { id: user.id, token: session.accessToken };
  }

  async function seedProduct(
    price = '10000000.00',
    categoryId?: string,
  ): Promise<{ productId: string; variantId: string; slug: string; categoryId: string }> {
    const suffix = uniqueSuffix();
    const category =
      categoryId ??
      (
        await prisma.category.create({
          data: { name: `دسته API ${suffix}`, slug: `pricing-api-cat-${suffix}` },
        })
      ).id;
    if (!categoryId) categoryIds.push(category);
    const product = await prisma.product.create({
      data: {
        name: `محصول API ${suffix}`,
        slug: `pricing-api-prod-${suffix}`,
        categoryId: category,
        condition: ProductCondition.NEW,
        status: ProductStatus.PUBLISHED,
      },
    });
    productIds.push(product.id);
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `PRICING-API-${suffix}`,
        price,
        priceStatus: 'PRICED',
      },
    });
    variantIds.push(variant.id);
    return {
      productId: product.id,
      variantId: variant.id,
      slug: product.slug,
      categoryId: category,
    };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await prisma.productPriceOverride.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.categoryPriceRule.deleteMany({
      where: { categoryId: { in: categoryIds } },
    });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.partner.deleteMany({ where: { id: { in: partnerIds } } });
    await prisma.currencyRate.deleteMany({ where: { id: { in: rateIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('requires an operator/admin for bulk pricing and currency recalculation', async () => {
    const customer = await userWithRole('CUSTOMER');
    const operator = await userWithRole('OPERATOR');
    const product = await seedProduct();
    const body = {
      scope: { type: 'VARIANTS', variantIds: [product.variantId] },
      operation: { kind: 'APPLY_DISCOUNT', mode: 'PERCENT', value: '10' },
    };
    await request(app.getHttpServer()).post(`${BULK}/preview`).send(body).expect(401);
    await request(app.getHttpServer())
      .post(`${BULK}/preview`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${BULK}/preview`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send(body)
      .expect(200);
    await request(app.getHttpServer())
      .post(`${CURRENCY}/recalculate/preview`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ currency: 'USD', rialPerUnit: '950000' })
      .expect(403);
  });

  it('previews and applies a selected-product percentage discount over HTTP', async () => {
    const operator = await userWithRole('OPERATOR');
    const a = await seedProduct('10000000.00');
    const b = await seedProduct('20000000.00');
    const body = {
      scope: { type: 'PRODUCTS', productIds: [a.productId, b.productId] },
      operation: { kind: 'APPLY_DISCOUNT', mode: 'PERCENT', value: '10' },
    };
    const preview = await request(app.getHttpServer())
      .post(`${BULK}/preview`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send(body)
      .expect(200);
    expect(preview.body).toMatchObject({
      total: 2,
      affected: 2,
      skipped: 0,
      failed: 0,
    });
    expect(typeof preview.body.previewToken).toBe('string');

    const applied = await request(app.getHttpServer())
      .post(`${BULK}/apply`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ ...body, previewToken: preview.body.previewToken })
      .expect(200);
    expect(applied.body.applied).toBe(true);
    expect(applied.body.summary).toMatchObject({ affected: 2, failed: 0 });
    const rows = await prisma.productVariant.findMany({
      where: { id: { in: [a.variantId, b.variantId] } },
      select: { discountedPrice: true },
      orderBy: { price: 'asc' },
    });
    expect(rows.map((row) => row.discountedPrice?.toString())).toEqual([
      '9000000',
      '18000000',
    ]);
  });

  it('rejects a stale preview token with 409 and applies nothing', async () => {
    const operator = await userWithRole('OPERATOR');
    const product = await seedProduct('10000000.00');
    const body = {
      scope: { type: 'VARIANTS', variantIds: [product.variantId] },
      operation: { kind: 'APPLY_DISCOUNT', mode: 'FIXED', value: '1000000' },
    };
    const preview = await request(app.getHttpServer())
      .post(`${BULK}/preview`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send(body)
      .expect(200);
    await prisma.productVariant.update({
      where: { id: product.variantId },
      data: { price: '11000000.00' },
    });
    await request(app.getHttpServer())
      .post(`${BULK}/apply`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ ...body, previewToken: preview.body.previewToken })
      .expect(409);
    const row = await prisma.productVariant.findUniqueOrThrow({
      where: { id: product.variantId },
    });
    expect(row.discountedPrice).toBeNull();
  });

  it('supports category scope with descendants and previews affected products', async () => {
    const operator = await userWithRole('OPERATOR');
    const suffix = uniqueSuffix();
    const parent = await prisma.category.create({
      data: { name: `والد ${suffix}`, slug: `pricing-api-parent-${suffix}` },
    });
    categoryIds.push(parent.id);
    const child = await prisma.category.create({
      data: {
        name: `فرزند ${suffix}`,
        slug: `pricing-api-child-${suffix}`,
        parentId: parent.id,
      },
    });
    categoryIds.push(child.id);
    const direct = await seedProduct('10000000.00', parent.id);
    const descendant = await seedProduct('10000000.00', child.id);
    const preview = await request(app.getHttpServer())
      .post(`${BULK}/category-rules/preview`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({
        categoryId: parent.id,
        includeDescendants: true,
        type: 'PERCENT',
        value: '20',
      })
      .expect(200);
    expect(preview.body.affected).toBe(2);
    expect(preview.body.rows.map((row: { variantId: string }) => row.variantId).sort()).toEqual(
      [direct.variantId, descendant.variantId].sort(),
    );
    const rule = await request(app.getHttpServer())
      .post('/api/v1/admin/pricing/category-rules')
      .set('Authorization', `Bearer ${operator.token}`)
      .send({
        categoryId: parent.id,
        includeDescendants: true,
        type: 'PERCENT',
        value: '20',
      })
      .expect(201);
    expect(rule.body.includeDescendants).toBe(true);
    expect(rule.body.status).toBe('ACTIVE');
  });

  it('never leaks the partner price through the public price or detail APIs', async () => {
    const product = await seedProduct('10000000.00');
    await prisma.productVariant.update({
      where: { id: product.variantId },
      data: { partnerPrice: '7000000.00' },
    });
    const guestPrice = await request(app.getHttpServer())
      .get(`/api/v1/catalog/products/${product.slug}/price`)
      .expect(200);
    expect(guestPrice.headers['cache-control']).toContain('no-store');
    expect(JSON.stringify(guestPrice.body)).not.toContain('7000000');
    const guestDetail = await request(app.getHttpServer())
      .get(`/api/v1/catalog/products/${product.slug}`)
      .expect(200);
    expect(JSON.stringify(guestDetail.body)).not.toContain('7000000');
    expect(JSON.stringify(guestDetail.body)).not.toContain('partnerPrice');

    const partnerUser = await userWithRole('PARTNER');
    const profile = await prisma.userProfile.create({
      data: {
        userId: partnerUser.id,
        firstName: 'همکار',
        lastName: 'API',
      },
    });
    const partner = await prisma.partner.create({
      data: {
        profileId: profile.id,
        businessName: `همکار API ${uniqueSuffix()}`,
        approvalStatus: PartnerApprovalStatus.APPROVED,
      },
    });
    partnerIds.push(partner.id);
    const partnerPrice = await request(app.getHttpServer())
      .get(`/api/v1/catalog/products/${product.slug}/price`)
      .set('Authorization', `Bearer ${partnerUser.token}`)
      .expect(200);
    expect(partnerPrice.body.quotes[0].resolvedPrice).toBe('7000000');
    expect(partnerPrice.headers['cache-control']).toContain('no-store');
  });

  it('previews and applies an audited FX recalculation', async () => {
    const admin = await userWithRole('ADMIN');
    const product = await seedProduct('90000000.00');
    await prisma.productVariant.update({
      where: { id: product.variantId },
      data: {
        priceSourceCurrency: 'USD',
        priceSourceAmount: new Prisma.Decimal(100),
        priceSourceRate: new Prisma.Decimal(900000),
      },
    });
    const preview = await request(app.getHttpServer())
      .post(`${CURRENCY}/recalculate/preview`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ currency: 'USD', rialPerUnit: '950000' })
      .expect(201);
    expect(preview.body.rows[0].proposedRegularPrice).toBe('95000000');
    const applied = await request(app.getHttpServer())
      .post(`${CURRENCY}/recalculate`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        currency: 'USD',
        rialPerUnit: '950000',
        previewToken: preview.body.previewToken,
      })
      .expect(201);
    rateIds.push(applied.body.rateId);
    expect(applied.body.affected).toBeGreaterThanOrEqual(1);
    const updated = await prisma.productVariant.findUniqueOrThrow({
      where: { id: product.variantId },
    });
    expect(updated.price.toString()).toBe('95000000');
    expect(updated.priceUpdatedAt).not.toBeNull();
  });

  it('returns order notes and shipment tracking in the inline operator list', async () => {
    const admin = await userWithRole('ADMIN');
    const customer = await userWithRole('CUSTOMER');
    const order = await prisma.order.create({
      data: {
        orderNumber: 9_900_000 + Math.floor(Math.random() * 90_000),
        userId: customer.id,
        status: 'PENDING',
        paymentMethod: 'COD',
        paymentStatus: 'PENDING',
        subtotal: '100000',
        total: '100000',
        fullName: 'مشتری تست',
        phone: '+989120000000',
        address: 'نشانی تست',
        note: 'یادداشت تست سفارش',
        shipment: {
          create: {
            method: 'STORE_PICKUP',
            status: 'PENDING',
            trackingNumber: 'TRACK-1',
          },
        },
      },
    });
    try {
      const list = await request(app.getHttpServer())
        .get('/api/v1/admin/orders')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);
      const row = list.body.items.find((item: { id: string }) => item.id === order.id);
      expect(row.note).toBe('یادداشت تست سفارش');
      expect(row.shipment).toMatchObject({
        status: 'PENDING',
        trackingNumber: 'TRACK-1',
      });
    } finally {
      await prisma.order.delete({ where: { id: order.id } });
    }
  });
});
