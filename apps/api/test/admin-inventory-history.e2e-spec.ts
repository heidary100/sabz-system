import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  InventoryMovementType,
  ProductCondition,
  ProductStatus,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const BASE = '/api/v1/admin/inventory';
const INVALID_UUID = '00000000-0000-0000-0000-000000000000';

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

describe('Admin inventory history API (SS-114) (e2e)', () => {
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

  let seededVariantId: string;
  let seededWarehouseId: string;

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

  async function createUser(role: string) {
    const mobile = uniqueMobile();
    mobiles.push(mobile);
    const user = await prisma.user.create({ data: { mobile, status: 'ACTIVE' } });
    userIds.push(user.id);
    if (role) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: roleIds[role]!, assignedBy: user.id },
      });
    }
    await prisma.userProfile.create({
      data: { userId: user.id, firstName: 'علی', lastName: 'احمدی' },
    });
    const tokens = await tokenService.createSession(user.id);
    return { userId: user.id, accessToken: tokens.accessToken };
  }

  async function createProduct(
    overrides: { status?: ProductStatus; deletedAt?: Date | null } = {},
  ): Promise<string> {
    const brand = await prisma.brand.create({
      data: {
        name: `برند ${Date.now()}`,
        slug: `brand-e2e-hist-${Date.now()}-${Math.random()}`,
      },
    });
    brandIds.push(brand.id);
    const category = await prisma.category.create({
      data: {
        name: `دسته ${Date.now()}`,
        slug: `cat-e2e-hist-${Date.now()}-${Math.random()}`,
      },
    });
    categoryIds.push(category.id);
    const product = await prisma.product.create({
      data: {
        name: `محصول ${Date.now()}`,
        slug: `prod-e2e-hist-${Date.now()}-${Math.random()}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
        status: overrides.status ?? ProductStatus.DRAFT,
        deletedAt: overrides.deletedAt ?? null,
      },
    });
    productIds.push(product.id);
    return product.id;
  }

  async function createVariant(
    productId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku: `E2E-HIST-SKU-${Date.now()}-${Math.random()}`,
        price: '100.00',
        stockQuantity: 0,
        ...overrides,
      } as never,
    });
    variantIds.push(variant.id);
    return variant.id;
  }

  async function createWarehouse(): Promise<string> {
    const warehouse = await prisma.warehouse.create({
      data: {
        code: `E2E-HIST-WH-${Date.now()}-${Math.random()}`,
        name: 'انبار تست',
      },
    });
    warehouseIds.push(warehouse.id);
    return warehouse.id;
  }

  async function trackItem(variantId: string, warehouseId: string) {
    const item = await prisma.inventoryItem.findUnique({
      where: { variantId_warehouseId: { variantId, warehouseId } },
      select: { id: true },
    });
    if (item) {
      itemIds.push(item.id);
    }
  }

  function movementsUrl(query: string): string {
    return `${BASE}/movements?${query}`;
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

    const productId = await createProduct();
    seededVariantId = await createVariant(productId);
    seededWarehouseId = await createWarehouse();
  });

  afterAll(async () => {
    const trackedItems = await prisma.inventoryItem.findMany({
      where: {
        OR: [{ id: { in: itemIds } }, { variantId: { in: variantIds } }],
      },
      select: { id: true },
    });
    const trackedItemIds = trackedItems.map((row) => row.id);
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: trackedItemIds } },
          { entityId: { in: variantIds } },
        ],
      },
    });
    await prisma.inventoryMovement.deleteMany({
      where: { inventoryItemId: { in: trackedItemIds } },
    });
    await prisma.reservation.deleteMany({
      where: { inventoryItemId: { in: trackedItemIds } },
    });
    await prisma.inventoryItem.deleteMany({
      where: { id: { in: trackedItemIds } },
    });
    await prisma.warehouse.deleteMany({ where: { id: { in: warehouseIds } } });
    await prisma.productVariant.deleteMany({
      where: { id: { in: variantIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: brandIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ entityId: { in: userIds } }, { userId: { in: userIds } }],
      },
    });
    await prisma.userSession.deleteMany({
      where: { user: { mobile: { in: mobiles } } },
    });
    await prisma.user.deleteMany({ where: { mobile: { in: mobiles } } });
    await app.close();
  });

  describe('authentication and authorization', () => {
    it('rejects the endpoint without a token with 401', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/movements`)
        .expect(401);
    });

    it('rejects CUSTOMER and PARTNER with 403', async () => {
      const customer = await createUser('CUSTOMER');
      const partner = await createUser('PARTNER');

      for (const token of [customer.accessToken, partner.accessToken]) {
        await request(app.getHttpServer())
          .get(`${BASE}/movements`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
      }
    });

    it('allows OPERATOR and ADMIN with the paginated envelope', async () => {
      const operator = await createUser('OPERATOR');
      const admin = await createUser('ADMIN');

      for (const token of [operator.accessToken, admin.accessToken]) {
        const res = await request(app.getHttpServer())
          .get(`${BASE}/movements`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        expect(res.body).toEqual({
          items: expect.any(Array),
          total: expect.any(Number),
          page: 1,
          limit: 20,
        });
      }
    });
  });

  describe('history over the mutation API ledger', () => {
    let operatorToken: string;
    let operatorUserId: string;

    beforeAll(async () => {
      const operator = await createUser('OPERATOR');
      operatorToken = operator.accessToken;
      operatorUserId = operator.userId;

      await request(app.getHttpServer())
        .post(`${BASE}/receive`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ variantId: seededVariantId, warehouseId: seededWarehouseId, quantity: 10, notes: 'رسید' })
        .expect(200);
      await trackItem(seededVariantId, seededWarehouseId);

      await request(app.getHttpServer())
        .post(`${BASE}/adjust`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ variantId: seededVariantId, warehouseId: seededWarehouseId, quantity: 12, reason: 'تطبیق' })
        .expect(200);
    });

    it('exposes the INITIAL_STOCK and MANUAL_ADJUSTMENT movements newest-first', async () => {
      const res = await request(app.getHttpServer())
        .get(movementsUrl(`variantId=${seededVariantId}`))
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.total).toBe(2);
      expect(res.body.items[0]!.type).toBe(InventoryMovementType.MANUAL_ADJUSTMENT);
      expect(res.body.items[0]!.reason).toBe('تطبیق');
      expect(res.body.items[1]!.type).toBe(InventoryMovementType.INITIAL_STOCK);
      expect(res.body.items[1]!.notes).toBe('رسید');
    });

    it('returns the actor shape for the acting user', async () => {
      const res = await request(app.getHttpServer())
        .get(movementsUrl(`variantId=${seededVariantId}`))
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.items[0]!.actor).toEqual({
        id: operatorUserId,
        mobile: expect.any(String),
        firstName: 'علی',
        lastName: 'احمدی',
      });
    });

    it('paginates with deterministic newest-first ordering', async () => {
      const res = await request(app.getHttpServer())
        .get(movementsUrl(`variantId=${seededVariantId}&page=1&limit=1`))
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.total).toBe(2);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]!.type).toBe(InventoryMovementType.MANUAL_ADJUSTMENT);
    });

    it('filters by warehouseId', async () => {
      const res = await request(app.getHttpServer())
        .get(movementsUrl(`warehouseId=${seededWarehouseId}`))
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.total).toBe(2);
      expect(
        res.body.items.every(
          (movement: { warehouseId: string }) =>
            movement.warehouseId === seededWarehouseId,
        ),
      ).toBe(true);
    });

    it('filters by movement type', async () => {
      const res = await request(app.getHttpServer())
        .get(movementsUrl(`type=${InventoryMovementType.INITIAL_STOCK}`))
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.total).toBeGreaterThanOrEqual(1);
      expect(
        res.body.items.every(
          (movement: { type: string }) => movement.type === 'INITIAL_STOCK',
        ),
      ).toBe(true);
    });

    it('filters by an inclusive from/to window covering the seeds', async () => {
      const from = new Date(Date.now() - 60_000).toISOString();
      const to = new Date(Date.now() + 60_000).toISOString();

      const res = await request(app.getHttpServer())
        .get(movementsUrl(`variantId=${seededVariantId}&from=${from}&to=${to}`))
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.total).toBe(2);
    });

    it('combines filters with AND', async () => {
      const res = await request(app.getHttpServer())
        .get(
          movementsUrl(
            `variantId=${seededVariantId}&warehouseId=${seededWarehouseId}&type=${InventoryMovementType.MANUAL_ADJUSTMENT}`,
          ),
        )
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.items[0]!.type).toBe(InventoryMovementType.MANUAL_ADJUSTMENT);
    });

    it('returns an empty page for a valid but nonexistent variant id', async () => {
      const res = await request(app.getHttpServer())
        .get(movementsUrl(`variantId=${INVALID_UUID}`))
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body).toEqual({ items: [], total: 0, page: 1, limit: 20 });
    });

    it('returns 400 for invalid query values', async () => {
      const cases = [
        `variantId=not-a-uuid`,
        `type=NOT_A_TYPE`,
        `from=not-a-date`,
        `to=not-a-date`,
        `page=0`,
        `limit=101`,
        `from=2026-08-31T00:00:00.000Z&to=2026-08-01T00:00:00.000Z`,
      ];

      for (const query of cases) {
        await request(app.getHttpServer())
          .get(movementsUrl(query))
          .set('Authorization', `Bearer ${operatorToken}`)
          .expect(400);
      }
    });

    it('never exposes internal or secret fields', async () => {
      const res = await request(app.getHttpServer())
        .get(movementsUrl(`variantId=${seededVariantId}`))
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('reference');
      expect(serialized).not.toContain('createdBy');
      expect(serialized).not.toContain('updatedBy');
      expect(serialized).not.toContain('deletedAt');
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('refreshToken');
      expect(serialized).not.toContain('sessionId');
      expect(serialized).not.toContain('storageKey');
    });

    it('resolves actor null when the actor row is missing', async () => {
      const ghost = await createUser('OPERATOR');
      const ghostProductId = await createProduct();
      const ghostVariantId = await createVariant(ghostProductId);
      const ghostWarehouseId = await createWarehouse();

      await request(app.getHttpServer())
        .post(`${BASE}/receive`)
        .set('Authorization', `Bearer ${ghost.accessToken}`)
        .send({ variantId: ghostVariantId, warehouseId: ghostWarehouseId, quantity: 3 })
        .expect(200);
      await trackItem(ghostVariantId, ghostWarehouseId);

      await prisma.userSession.deleteMany({ where: { userId: ghost.userId } });
      await prisma.user.delete({ where: { id: ghost.userId } });

      const res = await request(app.getHttpServer())
        .get(movementsUrl(`variantId=${ghostVariantId}`))
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.items[0]!.actor).toBeNull();
    });

    it('exposes no mutation routes on the movement resource', async () => {
      const token = operatorToken;
      await request(app.getHttpServer())
        .post(`${BASE}/movements`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(404);
      await request(app.getHttpServer())
        .put(`${BASE}/movements`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(404);
      await request(app.getHttpServer())
        .patch(`${BASE}/movements`)
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(404);
      await request(app.getHttpServer())
        .delete(`${BASE}/movements`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});