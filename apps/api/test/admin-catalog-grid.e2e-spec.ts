import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PriceStatus,
  ProductCondition,
  ProductStatus,
  WarehouseStatus,
} from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const GRID = '/api/v1/admin/catalog-grid';
const BATCH = `${GRID}/batch`;

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

/**
 * SS-257: server-paginated catalog grid + batch inline updates. Covers the
 * authorization matrix, request-level validation, the SS-251 invariant on the
 * batch path, per-row atomicity, partial success, optimistic concurrency
 * (stale updatedAt → per-row conflict, two-session pattern) and the
 * single-warehouse stock contract.
 */
describe('Admin catalog grid API (SS-257) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenService: TokenService;

  const mobiles: string[] = [];
  const userIds: string[] = [];
  const roleIds: Record<string, string> = {};
  const brandIds: string[] = [];
  const categoryIds: string[] = [];
  const productIds: string[] = [];
  const variantIds: string[] = [];
  const warehouseIds: string[] = [];
  const itemIds: string[] = [];

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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    tokenService = app.get(TokenService);

    for (const role of ['CUSTOMER', 'PARTNER', 'OPERATOR', 'ADMIN']) {
      roleIds[role] = await seedRole(role);
    }
  });

  afterAll(async () => {
    const orphanProducts = await prisma.product.findMany({
      where: {
        OR: [{ brandId: { in: brandIds } }, { categoryId: { in: categoryIds } }],
      },
      select: { id: true },
    });
    const orphanIds = orphanProducts.map((row) => row.id);
    const allVariantIds = [...variantIds].concat(
      (
        await prisma.productVariant.findMany({
          where: { productId: { in: orphanIds } },
          select: { id: true },
        })
      ).map((row) => row.id),
    );
    await prisma.inventoryMovement.deleteMany({
      where: { variantId: { in: allVariantIds } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: [...variantIds, ...itemIds] } },
          { userId: { in: userIds } },
        ],
      },
    });
    await prisma.reservation.deleteMany({
      where: { inventoryItem: { variantId: { in: allVariantIds } } },
    });
    await prisma.inventoryItem.deleteMany({
      where: { variantId: { in: allVariantIds } },
    });
    await prisma.productVariant.deleteMany({ where: { id: { in: allVariantIds } } });
    await prisma.product.deleteMany({ where: { id: { in: [...productIds, ...orphanIds] } } });
    await prisma.brand.deleteMany({ where: { id: { in: brandIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.userSession.deleteMany({
      where: { user: { mobile: { in: mobiles } } },
    });
    await prisma.user.deleteMany({ where: { mobile: { in: mobiles } } });
    await app.close();
  });

  async function createUser(role: string) {
    const mobile = uniqueMobile();
    mobiles.push(mobile);
    const user = await prisma.user.create({
      data: { mobile, status: 'ACTIVE' },
    });
    userIds.push(user.id);
    await prisma.userRole.create({
      data: { userId: user.id, roleId: roleIds[role]!, assignedBy: user.id },
    });
    await prisma.userProfile.create({
      data: { userId: user.id, firstName: 'علی', lastName: 'احمدی' },
    });
    const tokens = await tokenService.createSession(user.id);
    return { userId: user.id, accessToken: tokens.accessToken };
  }

  async function createProduct(
    overrides: { status?: ProductStatus } = {},
  ): Promise<string> {
    const { productId } = await createProductDetailed(overrides);
    return productId;
  }

  /** Detailed variant used by the advanced-filter tests to assert on brand/category. */
  async function createProductDetailed(
    overrides: {
      status?: ProductStatus;
      condition?: ProductCondition;
      name?: string;
    } = {},
  ): Promise<{ productId: string; brandId: string; categoryId: string }> {
    const brand = await prisma.brand.create({
      data: {
        name: `برند ${Date.now()}-${Math.random()}`,
        slug: `brand-grid-${Date.now()}-${Math.random()}`,
      },
    });
    brandIds.push(brand.id);
    const category = await prisma.category.create({
      data: {
        name: `دسته ${Date.now()}-${Math.random()}`,
        slug: `cat-grid-${Date.now()}-${Math.random()}`,
      },
    });
    categoryIds.push(category.id);
    const product = await prisma.product.create({
      data: {
        name: overrides.name ?? `محصول شبکه ${Date.now()}-${Math.random()}`,
        slug: `prod-grid-${Date.now()}-${Math.random()}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: overrides.condition ?? ProductCondition.NEW,
        status: overrides.status ?? ProductStatus.PUBLISHED,
      },
    });
    productIds.push(product.id);
    return { productId: product.id, brandId: brand.id, categoryId: category.id };
  }

  async function createVariant(
    productId: string,
    overrides: {
      price?: string;
      compareAtPrice?: string | null;
      priceStatus?: PriceStatus;
      sku?: string;
    } = {},
  ) {
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku:
          overrides.sku ?? `GRID-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        price: overrides.price ?? '100000.00',
        compareAtPrice: overrides.compareAtPrice ?? null,
        priceStatus: overrides.priceStatus ?? PriceStatus.PRICED,
      },
    });
    variantIds.push(variant.id);
    return variant;
  }

  async function createWarehouse(): Promise<string> {
    const warehouse = await prisma.warehouse.create({
      data: {
        code: `WH-GRID-${Date.now()}-${Math.random()}`,
        name: `انبار شبکه ${Date.now()}`,
        status: WarehouseStatus.ACTIVE,
      },
    });
    warehouseIds.push(warehouse.id);
    return warehouse.id;
  }

  async function createItem(
    variantId: string,
    warehouseId: string,
    quantityOnHand: number,
  ) {
    const item = await prisma.inventoryItem.create({
      data: { variantId, warehouseId, quantityOnHand },
    });
    itemIds.push(item.id);
    return item;
  }

  describe('authorization', () => {
    it('rejects unauthenticated calls with 401', async () => {
      await request(app.getHttpServer()).get(GRID).expect(401);
      await request(app.getHttpServer()).post(BATCH).send({ rows: [] }).expect(401);
    });

    it('rejects CUSTOMER and PARTNER with 403', async () => {
      const customer = await createUser('CUSTOMER');
      const partner = await createUser('PARTNER');
      for (const token of [customer.accessToken, partner.accessToken]) {
        await request(app.getHttpServer())
          .get(GRID)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
        await request(app.getHttpServer())
          .post(BATCH)
          .set('Authorization', `Bearer ${token}`)
          .send({ rows: [] })
          .expect(403);
      }
    });

    it('allows OPERATOR and ADMIN to list', async () => {
      const operator = await createUser('OPERATOR');
      const admin = await createUser('ADMIN');
      for (const token of [operator.accessToken, admin.accessToken]) {
        await request(app.getHttpServer())
          .get(GRID)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      }
    });
  });

  describe('list', () => {
    it('returns variant-keyed rows with the required columns and server-side filters', async () => {
      const productId = await createProduct();
      const variant = await createVariant(productId, {
        sku: `GRID-FILTER-${Date.now()}`,
        price: '150000.00',
        compareAtPrice: '180000.00',
      });

      const operator = await createUser('OPERATOR');
      const list = await request(app.getHttpServer())
        .get(GRID)
        .query({ sku: 'GRID-FILTER' })
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(list.body.total).toBe(1);
      const row = list.body.items[0];
      expect(row.variantId).toBe(variant.id);
      expect(row.productId).toBe(productId);
      expect(row.sku).toBe(variant.sku);
      expect(row.price).toBe('150000');
      expect(row.compareAtPrice).toBe('180000');
      expect(row.priceStatus).toBe(PriceStatus.PRICED);
      expect(row.brandName).not.toBeNull();
      expect(row.categoryName).not.toBeNull();
      expect(row.thumbnailUrl).toBeNull();
      expect(row.stock).toBe(0);
      expect(row.stockEditable).toBe(false);
      expect(typeof row.expectedUpdatedAt).toBe('string');
      expect(new Date(row.expectedUpdatedAt).toISOString()).toBe(
        row.expectedUpdatedAt,
      );

      // SKU filter is a contains match and excludes unrelated variants.
      const noMatch = await request(app.getHttpServer())
        .get(GRID)
        .query({ sku: 'GRID-NOMATCH' })
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(noMatch.body.total).toBe(0);

      // Status filter (server-side) excludes non-matching products.
      const draftOnly = await request(app.getHttpServer())
        .get(GRID)
        .query({ status: ProductStatus.DRAFT })
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(
        draftOnly.body.items.some((item: { variantId: string }) => item.variantId === variant.id),
      ).toBe(false);
    });

    it('paginates server-side', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const first = await createVariant(productId);
      await createVariant(productId);

      const page1 = await request(app.getHttpServer())
        .get(GRID)
        .query({ page: 1, limit: 1 })
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(page1.body.items.length).toBe(1);
      expect(page1.body.total).toBeGreaterThanOrEqual(2);

      const page2 = await request(app.getHttpServer())
        .get(GRID)
        .query({ page: 2, limit: 1 })
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(page2.body.items[0].variantId).not.toBe(
        page1.body.items[0].variantId,
      );
      void first;
    });

    it('aggregates stock across warehouses and flags stockEditable only for a single warehouse', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variant = await createVariant(productId);
      const warehouseA = await createWarehouse();
      await createItem(variant.id, warehouseA, 7);

      const single = await request(app.getHttpServer())
        .get(GRID)
        .query({ sku: variant.sku })
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(single.body.items[0].stock).toBe(7);
      expect(single.body.items[0].stockEditable).toBe(true);

      const warehouseB = await createWarehouse();
      await createItem(variant.id, warehouseB, 3);

      const multi = await request(app.getHttpServer())
        .get(GRID)
        .query({ sku: variant.sku })
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(multi.body.items[0].stock).toBe(10);
      expect(multi.body.items[0].stockEditable).toBe(false);
    });
  });

  describe('batch — request-level validation', () => {
    it('rejects more than 50 rows', async () => {
      const operator = await createUser('OPERATOR');
      const rows = Array.from({ length: 51 }, (_, index) => ({
        variantId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        expectedUpdatedAt: new Date().toISOString(),
        stock: 1,
      }));
      const res = await request(app.getHttpServer())
        .post(BATCH)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ rows })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('۵۰');
    });

    it('rejects duplicate variant ids', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variant = await createVariant(productId);
      const row = {
        variantId: variant.id,
        expectedUpdatedAt: variant.updatedAt.toISOString(),
        price: '200000.00',
      };
      await request(app.getHttpServer())
        .post(BATCH)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ rows: [row, row] })
        .expect(400);
    });

    it('rejects malformed prices and missing fields', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variant = await createVariant(productId);

      await request(app.getHttpServer())
        .post(BATCH)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({
          rows: [
            {
              variantId: variant.id,
              expectedUpdatedAt: variant.updatedAt.toISOString(),
              price: '12.345',
            },
          ],
        })
        .expect(400);

      await request(app.getHttpServer())
        .post(BATCH)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ rows: [{ expectedUpdatedAt: new Date().toISOString(), stock: 1 }] })
        .expect(400);

      await request(app.getHttpServer())
        .post(BATCH)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ rows: [] })
        .expect(400);
    });
  });

  describe('batch — row outcomes, invariant and atomicity', () => {
    it('applies price, compareAt and stock in one row and writes movement, audit and minPrice', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variant = await createVariant(productId, { price: '100000.00' });
      const warehouse = await createWarehouse();
      const item = await createItem(variant.id, warehouse, 5);

      const res = await request(app.getHttpServer())
        .post(BATCH)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({
          rows: [
            {
              variantId: variant.id,
              expectedUpdatedAt: variant.updatedAt.toISOString(),
              price: '120000.00',
              compareAtPrice: '150000.00',
              stock: 9,
            },
          ],
        })
        .expect(200);
      expect(res.body.summary).toEqual({ succeeded: 1, failed: 0 });
      const result = res.body.results[0];
      expect(result.outcome).toBe('SUCCESS');
      expect(result.price).toBe('120000');
      expect(result.compareAtPrice).toBe('150000');
      expect(result.stock).toBe(9);
      expect(new Date(result.updatedAt).toISOString()).toBe(result.updatedAt);
      expect(result.updatedAt).not.toBe(variant.updatedAt.toISOString());

      const after = await prisma.productVariant.findUnique({
        where: { id: variant.id },
      });
      expect(after!.price.toString()).toBe('120000');
      expect(after!.compareAtPrice!.toString()).toBe('150000');
      expect(after!.updatedBy).toBe(operator.userId);

      const itemAfter = await prisma.inventoryItem.findUnique({
        where: { id: item.id },
      });
      expect(itemAfter!.quantityOnHand).toBe(9);

      const movements = await prisma.inventoryMovement.findMany({
        where: { variantId: variant.id },
      });
      expect(movements.length).toBe(1);
      expect(movements[0]!.onHandBefore).toBe(5);
      expect(movements[0]!.onHandAfter).toBe(9);
      expect(movements[0]!.quantity).toBe(4);

      const audits = await prisma.auditLog.findMany({
        where: { entityId: variant.id },
      });
      expect(audits.map((entry) => entry.action).sort()).toEqual([
        'PRODUCT_VARIANT_UPDATED',
      ]);
      const itemAudits = await prisma.auditLog.findMany({
        where: { entityId: item.id },
      });
      expect(itemAudits.map((entry) => entry.action)).toEqual([
        'INVENTORY_ADJUSTED',
      ]);

      const product = await prisma.product.findUnique({ where: { id: productId } });
      expect(product!.minPrice!.toString()).toBe('120000');
    });

    it('keeps each row atomic: an invariant-breaking compareAt leaves the stock of the same row untouched', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variant = await createVariant(productId, { price: '100000.00' });
      const warehouse = await createWarehouse();
      const item = await createItem(variant.id, warehouse, 5);

      const res = await request(app.getHttpServer())
        .post(BATCH)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({
          rows: [
            {
              variantId: variant.id,
              expectedUpdatedAt: variant.updatedAt.toISOString(),
              compareAtPrice: '90000.00',
              stock: 42,
            },
          ],
        })
        .expect(200);
      expect(res.body.summary).toEqual({ succeeded: 0, failed: 1 });
      expect(res.body.results[0].outcome).toBe('VALIDATION_ERROR');
      expect(res.body.results[0].fieldErrors.compareAtPrice).toBeTruthy();

      const after = await prisma.productVariant.findUnique({
        where: { id: variant.id },
      });
      expect(after!.price.toString()).toBe('100000');
      expect(after!.compareAtPrice).toBeNull();
      const itemAfter = await prisma.inventoryItem.findUnique({
        where: { id: item.id },
      });
      expect(itemAfter!.quantityOnHand).toBe(5);
      expect(
        await prisma.inventoryMovement.count({ where: { variantId: variant.id } }),
      ).toBe(0);
    });

    it('enforces the PRICED requirement for compareAt and clears compareAt on explicit null', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const callForPrice = await createVariant(productId, {
        priceStatus: PriceStatus.CALL_FOR_PRICE,
        price: '0.00',
      });
      const sale = await createVariant(productId, {
        price: '100000.00',
        compareAtPrice: '120000.00',
      });

      const res = await request(app.getHttpServer())
        .post(BATCH)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({
          rows: [
            {
              variantId: callForPrice.id,
              expectedUpdatedAt: callForPrice.updatedAt.toISOString(),
              compareAtPrice: '50000.00',
            },
            {
              variantId: sale.id,
              expectedUpdatedAt: sale.updatedAt.toISOString(),
              compareAtPrice: null,
            },
          ],
        })
        .expect(200);
      expect(res.body.results[0].outcome).toBe('VALIDATION_ERROR');
      expect(res.body.results[1].outcome).toBe('SUCCESS');
      expect(res.body.results[1].compareAtPrice).toBeNull();

      const saleAfter = await prisma.productVariant.findUnique({
        where: { id: sale.id },
      });
      expect(saleAfter!.compareAtPrice).toBeNull();
    });

    it('reports partial success: an unknown row does not abort a valid row', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variant = await createVariant(productId);
      const unknownId = '00000000-0000-4000-8000-000000000000';

      const res = await request(app.getHttpServer())
        .post(BATCH)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({
          rows: [
            { variantId: unknownId, expectedUpdatedAt: new Date().toISOString(), stock: 3 },
            {
              variantId: variant.id,
              expectedUpdatedAt: variant.updatedAt.toISOString(),
              price: '111000.00',
            },
          ],
        })
        .expect(200);
      expect(res.body.results[0]).toMatchObject({ variantId: unknownId, outcome: 'NOT_FOUND' });
      expect(res.body.results[1]).toMatchObject({ variantId: variant.id, outcome: 'SUCCESS' });
      expect(res.body.summary).toEqual({ succeeded: 1, failed: 1 });

      const after = await prisma.productVariant.findUnique({
        where: { id: variant.id },
      });
      expect(after!.price.toString()).toBe('111000');
    });

    it('returns a row-level conflict for a stale updatedAt and never overwrites newer data', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variant = await createVariant(productId, { price: '100000.00' });
      const staleToken = variant.updatedAt.toISOString();

      // A concurrent mutation happens after the admin loaded the row.
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/variants/${variant.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ price: '999000.00' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(BATCH)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({
          rows: [
            {
              variantId: variant.id,
              expectedUpdatedAt: staleToken,
              price: '123000.00',
            },
          ],
        })
        .expect(200);
      expect(res.body.results[0].outcome).toBe('CONFLICT_CHANGED');

      const after = await prisma.productVariant.findUnique({
        where: { id: variant.id },
      });
      expect(after!.price.toString()).toBe('999000');
    });

    it('two-session concurrency: the second session receives a row-level 409 and the first session keeps its values', async () => {
      const sessionA = await createUser('OPERATOR');
      const sessionB = await createUser('OPERATOR');
      const productId = await createProduct();
      const variant = await createVariant(productId, { price: '100000.00' });

      // Both sessions load the same row version from the grid.
      const load = async (token: string) => {
        const res = await request(app.getHttpServer())
          .get(GRID)
          .query({ sku: variant.sku })
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        return res.body.items[0] as {
          variantId: string;
          expectedUpdatedAt: string;
        };
      };
      const viewA = await load(sessionA.accessToken);
      const viewB = await load(sessionB.accessToken);
      expect(viewA.expectedUpdatedAt).toBe(viewB.expectedUpdatedAt);

      // Session A saves first.
      const saveA = await request(app.getHttpServer())
        .post(BATCH)
        .set('Authorization', `Bearer ${sessionA.accessToken}`)
        .send({
          rows: [
            { variantId: variant.id, expectedUpdatedAt: viewA.expectedUpdatedAt, price: '222000.00' },
          ],
        })
        .expect(200);
      expect(saveA.body.results[0].outcome).toBe('SUCCESS');

      // Session B submits its stale edit.
      const saveB = await request(app.getHttpServer())
        .post(BATCH)
        .set('Authorization', `Bearer ${sessionB.accessToken}`)
        .send({
          rows: [
            { variantId: variant.id, expectedUpdatedAt: viewB.expectedUpdatedAt, price: '333000.00' },
          ],
        })
        .expect(200);
      expect(saveB.body.results[0].outcome).toBe('CONFLICT_CHANGED');

      // Session A's values persist; B can refetch the authoritative version.
      const persisted = await prisma.productVariant.findUnique({
        where: { id: variant.id },
      });
      expect(persisted!.price.toString()).toBe('222000');

      const refetchB = await request(app.getHttpServer())
        .get(GRID)
        .query({ sku: variant.sku })
        .set('Authorization', `Bearer ${sessionB.accessToken}`)
        .expect(200);
      expect(refetchB.body.items[0].price).toBe('222000');
      expect(refetchB.body.items[0].expectedUpdatedAt).not.toBe(
        viewB.expectedUpdatedAt,
      );
    });
  });

  describe('batch — stock-specific outcomes', () => {
    it('records a zero-delta MANUAL_ADJUSTMENT for an equal-value stock write', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variant = await createVariant(productId);
      const warehouse = await createWarehouse();
      await createItem(variant.id, warehouse, 5);

      const res = await request(app.getHttpServer())
        .post(BATCH)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({
          rows: [
            {
              variantId: variant.id,
              expectedUpdatedAt: variant.updatedAt.toISOString(),
              stock: 5,
            },
          ],
        })
        .expect(200);
      expect(res.body.results[0].outcome).toBe('SUCCESS');
      expect(res.body.results[0].stock).toBe(5);

      const movement = await prisma.inventoryMovement.findFirst({
        where: { variantId: variant.id },
      });
      expect(movement!.quantity).toBe(0);
      expect(movement!.type).toBe('MANUAL_ADJUSTMENT');
    });

    it('rejects stock edits on multi-warehouse and item-less variants with field errors', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const multi = await createVariant(productId);
      const warehouseA = await createWarehouse();
      await createItem(multi.id, warehouseA, 1);
      const warehouseB = await createWarehouse();
      await createItem(multi.id, warehouseB, 2);
      const itemless = await createVariant(productId);

      const res = await request(app.getHttpServer())
        .post(BATCH)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({
          rows: [
            { variantId: multi.id, expectedUpdatedAt: multi.updatedAt.toISOString(), stock: 5 },
            { variantId: itemless.id, expectedUpdatedAt: itemless.updatedAt.toISOString(), stock: 5 },
          ],
        })
        .expect(200);
      expect(res.body.results[0].outcome).toBe('VALIDATION_ERROR');
      expect(res.body.results[0].fieldErrors.stock).toBeTruthy();
      expect(res.body.results[1].outcome).toBe('VALIDATION_ERROR');
      expect(res.body.results[1].fieldErrors.stock).toBeTruthy();

      // Rows are independent: the valid price row in the same request still applies.
      const priceRow = await createVariant(productId);
      const independent = await request(app.getHttpServer())
        .post(BATCH)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({
          rows: [
            { variantId: multi.id, expectedUpdatedAt: multi.updatedAt.toISOString(), stock: 5 },
            {
              variantId: priceRow.id,
              expectedUpdatedAt: priceRow.updatedAt.toISOString(),
              price: '777000.00',
            },
          ],
        })
        .expect(200);
      expect(independent.body.results[0].outcome).toBe('VALIDATION_ERROR');
      expect(independent.body.results[1].outcome).toBe('SUCCESS');
    });
  });

  describe('list — advanced filters, global search and sort (rework)', () => {
    /** Distinctive brand/category so global-search matches are unambiguous. */
    async function createSearchFixture(): Promise<{
      productId: string;
      brandId: string;
      categoryId: string;
      sku: string;
    }> {
      const brand = await prisma.brand.create({
        data: { name: 'انکر جستجو', slug: `brand-gs-${Date.now()}-${Math.random()}` },
      });
      brandIds.push(brand.id);
      const category = await prisma.category.create({
        data: { name: 'هندزفری جستجو', slug: `cat-gs-${Date.now()}-${Math.random()}` },
      });
      categoryIds.push(category.id);
      const product = await prisma.product.create({
        data: {
          name: 'پاوربانک جستجو',
          slug: `prod-gs-${Date.now()}-${Math.random()}`,
          brandId: brand.id,
          categoryId: category.id,
          condition: ProductCondition.NEW,
          status: ProductStatus.PUBLISHED,
        },
      });
      productIds.push(product.id);
      const sku = `GS-${Date.now()}`;
      await createVariant(product.id, { sku, price: '500000.00' });
      return { productId: product.id, brandId: brand.id, categoryId: category.id, sku };
    }

    async function listGrid(
      token: string,
      query: Record<string, string>,
    ): Promise<{ items: Array<Record<string, unknown>>; total: number }> {
      const res = await request(app.getHttpServer())
        .get(GRID)
        .query(query)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      return res.body;
    }

    it('global search matches product name, brand, category and SKU', async () => {
      const operator = await createUser('OPERATOR');
      const fixture = await createSearchFixture();

      for (const term of ['پاوربانک', 'انکر جستجو', 'هندزفری جستجو', fixture.sku]) {
        const result = await listGrid(operator.accessToken, { search: term });
        expect(result.items.some((row) => row.sku === fixture.sku)).toBe(true);
      }
      const none = await listGrid(operator.accessToken, { search: 'ناکسان-۹۹' });
      expect(none.total).toBe(0);
    });

    it('multi-select brand/status filters combine (AND) with the rest', async () => {
      const operator = await createUser('OPERATOR');
      const { brandId: brandA, productId: productA } = await createProductDetailed();
      const { brandId: brandB } = await createProductDetailed();
      await createVariant(productA, { sku: `MS-A-${Date.now()}` });

      const both = await listGrid(operator.accessToken, {
        brandIds: `${brandA},${brandB}`,
      });
      expect(both.total).toBeGreaterThanOrEqual(1);

      const single = await listGrid(operator.accessToken, { brandIds: brandA });
      expect(single.items.every((row) => row.productId === productA)).toBe(true);

      const archived = await listGrid(operator.accessToken, {
        brandIds: brandA,
        statuses: `${ProductStatus.ARCHIVED},${ProductStatus.DRAFT}`,
      });
      expect(archived.total).toBe(0);
    });

    it('filters by priceStatus, condition and price range', async () => {
      const operator = await createUser('OPERATOR');
      const { brandId } = await createProductDetailed({ condition: ProductCondition.REFURBISHED });
      const priced = await createVariant(
        (await prisma.product.findFirstOrThrow({ where: { brandId }, select: { id: true } })).id,
        { sku: `PS-PRICED-${Date.now()}`, price: '500000.00' },
      );
      const callForPrice = await prisma.productVariant.create({
        data: {
          productId: priced.productId,
          sku: `PS-CFP-${Date.now()}`,
          price: '0.00',
          priceStatus: PriceStatus.CALL_FOR_PRICE,
        },
      });
      variantIds.push(callForPrice.id);

      const cfp = await listGrid(operator.accessToken, {
        brandId,
        priceStatus: PriceStatus.CALL_FOR_PRICE,
      });
      expect(cfp.total).toBe(1);
      expect(cfp.items[0]!.sku).toBe(callForPrice.sku);

      const refurbished = await listGrid(operator.accessToken, {
        brandId,
        condition: ProductCondition.REFURBISHED,
      });
      expect(refurbished.total).toBe(2);

      const range = await listGrid(operator.accessToken, {
        brandId,
        minPrice: '400000',
        maxPrice: '600000',
      });
      expect(range.items.map((row) => row.sku)).toEqual([priced.sku]);
    });

    it('filters by aggregate stock bucket and sorts on stock', async () => {
      const operator = await createUser('OPERATOR');
      const { brandId } = await createProductDetailed();
      const productId = (
        await prisma.product.findFirstOrThrow({ where: { brandId }, select: { id: true } })
      ).id;
      const empty = await createVariant(productId, { sku: `ST-EMPTY-${Date.now()}` });
      const full = await createVariant(productId, { sku: `ST-FULL-${Date.now()}` });
      const warehouse = await createWarehouse();
      await createItem(empty.id, warehouse, 0);
      await createItem(full.id, warehouse, 9);

      const out = await listGrid(operator.accessToken, {
        brandId,
        stockStatus: 'OUT_OF_STOCK',
      });
      expect(out.items.map((row) => row.sku)).toEqual([empty.sku]);

      const inStock = await listGrid(operator.accessToken, {
        brandId,
        stockStatus: 'IN_STOCK',
      });
      expect(inStock.items.map((row) => row.sku)).toEqual([full.sku]);

      const byStockDesc = await listGrid(operator.accessToken, {
        brandId,
        sortBy: 'stock',
        sortDir: 'desc',
      });
      expect(byStockDesc.items.map((row) => row.sku)).toEqual([full.sku, empty.sku]);

      const byStockAsc = await listGrid(operator.accessToken, {
        brandId,
        sortBy: 'stock',
        sortDir: 'asc',
      });
      expect(byStockAsc.items.map((row) => row.sku)).toEqual([empty.sku, full.sku]);
    });

    it('sorts by price, sku, product name and compareAt (nulls last)', async () => {
      const operator = await createUser('OPERATOR');
      const { brandId } = await createProductDetailed();
      const productId = (
        await prisma.product.findFirstOrThrow({ where: { brandId }, select: { id: true } })
      ).id;
      const low = await createVariant(productId, { sku: `SO-A-${Date.now()}`, price: '100000.00' });
      const high = await createVariant(productId, { sku: `SO-B-${Date.now()}`, price: '900000.00' });
      const sale = await createVariant(productId, {
        sku: `SO-C-${Date.now()}`,
        price: '200000.00',
        compareAtPrice: '250000.00',
      });
      const noSale = await createVariant(productId, { sku: `SO-D-${Date.now()}`, price: '300000.00' });
      void low;
      void high;

      const byPrice = await listGrid(operator.accessToken, {
        brandId,
        sortBy: 'price',
        sortDir: 'asc',
      });
      expect(byPrice.items.map((row) => row.price)).toEqual([
        '100000',
        '200000',
        '300000',
        '900000',
      ]);

      const bySku = await listGrid(operator.accessToken, {
        brandId,
        sortBy: 'sku',
        sortDir: 'asc',
      });
      const createdSkus = [low.sku, high.sku, sale.sku, noSale.sku].sort();
      expect(bySku.items.map((row) => row.sku)).toEqual(createdSkus);

      const byCompareAt = await listGrid(operator.accessToken, {
        brandId,
        sortBy: 'compareAtPrice',
        sortDir: 'asc',
      });
      expect(byCompareAt.items[0]!.sku).toBe(sale.sku);
      // Every null-compareAt row sorts last (relative order = id tiebreak).
      expect(new Set(byCompareAt.items.slice(1).map((row) => row.sku))).toEqual(
        new Set([low.sku, high.sku, noSale.sku]),
      );
    });
  });

  describe('batch — variant field updates (rework)', () => {
    it('updates sku/barcode/variantName/price/compareAt/stock in one row and echoes authoritative values', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variant = await createVariant(productId, {
        sku: `VF-OLD-${Date.now()}`,
        price: '100000.00',
      });
      const warehouse = await createWarehouse();
      await createItem(variant.id, warehouse, 5);

      const newSku = `VF-NEW-${Date.now()}`;
      const res = await request(app.getHttpServer())
        .post(BATCH)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({
          rows: [
            {
              variantId: variant.id,
              expectedUpdatedAt: variant.updatedAt.toISOString(),
              sku: newSku,
              barcode: 'BC-12345',
              variantName: 'نام واریانت شبکه',
              price: '120000.00',
              compareAtPrice: '150000.00',
              stock: 8,
            },
          ],
        })
        .expect(200);
      expect(res.body.results[0]!.outcome).toBe('SUCCESS');
      expect(res.body.results[0]!.sku).toBe(newSku);
      expect(res.body.results[0]!.barcode).toBe('BC-12345');
      expect(res.body.results[0]!.variantName).toBe('نام واریانت شبکه');

      const after = await prisma.productVariant.findUnique({ where: { id: variant.id } });
      expect(after!.sku).toBe(newSku);
      expect(after!.barcode).toBe('BC-12345');
      expect(after!.name).toBe('نام واریانت شبکه');
      expect(after!.price.toString()).toBe('120000');

      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: variant.id, action: 'PRODUCT_VARIANT_UPDATED' },
      });
      const beforeDelta = audit.before as Record<string, unknown>;
      const afterDelta = audit.after as Record<string, unknown>;
      expect(beforeDelta['sku']).toBe(variant.sku);
      expect(afterDelta['sku']).toBe(newSku);
      expect(afterDelta['name']).toBe('نام واریانت شبکه');
    });

    it('rejects a duplicate SKU as a row VALIDATION_ERROR without writing the row', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const first = await createVariant(productId, { sku: `DUP-${Date.now()}` });
      const second = await createVariant(productId, { sku: `UNIQ-${Date.now()}` });

      const res = await request(app.getHttpServer())
        .post(BATCH)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({
          rows: [
            {
              variantId: second.id,
              expectedUpdatedAt: second.updatedAt.toISOString(),
              sku: first.sku,
            },
          ],
        })
        .expect(200);
      expect(res.body.results[0]!.outcome).toBe('VALIDATION_ERROR');
      expect(res.body.results[0]!.fieldErrors!.sku).toContain('قبلاً وجود دارد');

      const secondAfter = await prisma.productVariant.findUnique({
        where: { id: second.id },
      });
      expect(secondAfter!.sku).toBe(second.sku);
    });

    it('clears barcode and variant name on explicit null', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variant = await prisma.productVariant.create({
        data: {
          productId,
          sku: `NULLCL-${Date.now()}`,
          price: '100000.00',
          barcode: 'BC-TO-CLEAR',
          name: 'برای پاک‌کردن',
        },
      });
      variantIds.push(variant.id);

      const res = await request(app.getHttpServer())
        .post(BATCH)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({
          rows: [
            {
              variantId: variant.id,
              expectedUpdatedAt: variant.updatedAt.toISOString(),
              barcode: null,
              variantName: null,
            },
          ],
        })
        .expect(200);
      expect(res.body.results[0]!.outcome).toBe('SUCCESS');
      expect(res.body.results[0]!.barcode).toBeNull();
      expect(res.body.results[0]!.variantName).toBeNull();

      const after = await prisma.productVariant.findUnique({ where: { id: variant.id } });
      expect(after!.barcode).toBeNull();
      expect(after!.name).toBeNull();
    });
  });
});
