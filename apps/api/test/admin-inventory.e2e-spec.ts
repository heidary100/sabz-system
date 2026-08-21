import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  ProductCondition,
  ProductStatus,
  WarehouseStatus,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/database/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

jest.setTimeout(60_000);

const BASE = '/api/v1/admin/inventory';
const WH_INVENTORY = '/api/v1/admin/warehouses';
const INVALID_UUID = '00000000-0000-0000-0000-000000000000';

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

describe('Admin inventory read API (SS-112) (e2e)', () => {
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

  async function seedCatalog() {
    const brand = await prisma.brand.create({
      data: {
        name: `برند ${Date.now()}`,
        slug: `brand-e2e-inv-${Date.now()}-${Math.random()}`,
      },
    });
    brandIds.push(brand.id);
    const category = await prisma.category.create({
      data: {
        name: `دسته ${Date.now()}`,
        slug: `cat-e2e-inv-${Date.now()}-${Math.random()}`,
      },
    });
    categoryIds.push(category.id);

    const product = await prisma.product.create({
      data: {
        name: `محصول ${Date.now()}`,
        slug: `prod-e2e-inv-${Date.now()}-${Math.random()}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
        status: ProductStatus.PUBLISHED,
      },
    });
    productIds.push(product.id);

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `E2E-INV-SKU-${Date.now()}`,
        price: '100.00',
        stockQuantity: 0,
        name: 'واریانت قابلیت جستجو',
      },
    });
    variantIds.push(variant.id);

    const activeWarehouse = await prisma.warehouse.create({
      data: {
        code: `E2E-WH-${Date.now()}`,
        name: 'انبار فعال',
        status: WarehouseStatus.ACTIVE,
      },
    });
    warehouseIds.push(activeWarehouse.id);

    const secondWarehouse = await prisma.warehouse.create({
      data: {
        code: `E2E-WH2-${Date.now()}`,
        name: 'انبار دوم',
        status: WarehouseStatus.ACTIVE,
      },
    });
    warehouseIds.push(secondWarehouse.id);

    const inactiveWarehouse = await prisma.warehouse.create({
      data: {
        code: `E2E-WHI-${Date.now()}`,
        name: 'انبار غیرفعال',
        status: WarehouseStatus.INACTIVE,
      },
    });
    warehouseIds.push(inactiveWarehouse.id);

    const itemA = await prisma.inventoryItem.create({
      data: {
        variantId: variant.id,
        warehouseId: activeWarehouse.id,
        quantityOnHand: 10,
        quantityReserved: 2,
        reorderLevel: 5,
        criticalLevel: 2,
      },
    });
    itemIds.push(itemA.id);
    await prisma.inventoryItem.create({
      data: {
        variantId: variant.id,
        warehouseId: secondWarehouse.id,
        quantityOnHand: 4,
        quantityReserved: 0,
      },
    });
    itemIds.push((await prisma.inventoryItem.findUniqueOrThrow({
      where: {
        variantId_warehouseId: {
          variantId: variant.id,
          warehouseId: secondWarehouse.id,
        },
      },
    })).id);
    await prisma.inventoryItem.create({
      data: {
        variantId: variant.id,
        warehouseId: inactiveWarehouse.id,
        quantityOnHand: 100,
        quantityReserved: 0,
      },
    });
    itemIds.push((await prisma.inventoryItem.findUniqueOrThrow({
      where: {
        variantId_warehouseId: {
          variantId: variant.id,
          warehouseId: inactiveWarehouse.id,
        },
      },
    })).id);

    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { stockQuantity: 14 },
    });

    seededVariantId = variant.id;
    seededWarehouseId = activeWarehouse.id;
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

    await seedCatalog();
  });

  afterAll(async () => {
    await prisma.inventoryMovement.deleteMany({
      where: { inventoryItemId: { in: itemIds } },
    });
    await prisma.reservation.deleteMany({
      where: { inventoryItemId: { in: itemIds } },
    });
    await prisma.inventoryItem.deleteMany({ where: { id: { in: itemIds } } });
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
    it('rejects every endpoint without a token with 401', async () => {
      await request(app.getHttpServer()).get(BASE).expect(401);
      await request(app.getHttpServer())
        .get(`${BASE}/variants/${INVALID_UUID}`)
        .expect(401);
      await request(app.getHttpServer())
        .get(`${WH_INVENTORY}/${INVALID_UUID}/inventory`)
        .expect(401);
    });

    it('rejects CUSTOMER and PARTNER with 403 on every endpoint', async () => {
      const customer = await createUser('CUSTOMER');
      const partner = await createUser('PARTNER');

      for (const token of [customer.accessToken, partner.accessToken]) {
        await request(app.getHttpServer())
          .get(BASE)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
        await request(app.getHttpServer())
          .get(`${BASE}/variants/${seededVariantId}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
        await request(app.getHttpServer())
          .get(`${WH_INVENTORY}/${seededWarehouseId}/inventory`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
      }
    });

    it('allows OPERATOR and ADMIN on every endpoint', async () => {
      const operator = await createUser('OPERATOR');
      const admin = await createUser('ADMIN');

      for (const token of [operator.accessToken, admin.accessToken]) {
        const list = await request(app.getHttpServer())
          .get(BASE)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        expect(list.body).toHaveProperty('items');
        await request(app.getHttpServer())
          .get(`${BASE}/variants/${seededVariantId}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        await request(app.getHttpServer())
          .get(`${WH_INVENTORY}/${seededWarehouseId}/inventory`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      }
    });
  });

  describe('overview', () => {
    it('returns derived available and stock status without internal fields', async () => {
      const operator = await createUser('OPERATOR');
      const res = await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      const item = res.body.items.find(
        (row: { variantId: string; warehouseId: string }) =>
          row.variantId === seededVariantId &&
          row.warehouseId === seededWarehouseId,
      );
      expect(item).toBeDefined();
      expect(item.available).toBe(8);
      expect(item.quantityOnHand).toBe(10);
      expect(item.quantityReserved).toBe(2);
      expect(item.stockStatus).toBe('IN_STOCK');
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('deletedAt');
      expect(serialized).not.toContain('createdBy');
      expect(serialized).not.toContain('updatedBy');
      expect(serialized).not.toContain('movements');
      expect(serialized).not.toContain('reference');
    });

    it('supports pagination, variant filter, search and stockStatus filter', async () => {
      const operator = await createUser('OPERATOR');

      const paged = await request(app.getHttpServer())
        .get(`${BASE}?page=1&limit=5`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(paged.body.limit).toBe(5);
      expect(paged.body.page).toBe(1);
      expect(paged.body.items.length).toBeLessThanOrEqual(5);

      const byVariant = await request(app.getHttpServer())
        .get(`${BASE}?variantId=${seededVariantId}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(byVariant.body.items.length).toBe(2);
      expect(byVariant.body.items.every(
        (row: { warehouseId: string }) => row.warehouseId !== undefined,
      )).toBe(true);

      const byWarehouse = await request(app.getHttpServer())
        .get(`${BASE}?warehouseId=${seededWarehouseId}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(byWarehouse.body.items.length).toBe(1);
      expect(byWarehouse.body.items[0].warehouseId).toBe(seededWarehouseId);

      const bySku = await request(app.getHttpServer())
        .get(`${BASE}?search=E2E-INV-SKU`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(bySku.body.items.some(
        (row: { variantId: string }) => row.variantId === seededVariantId,
      )).toBe(true);

      const outOfStock = await request(app.getHttpServer())
        .get(`${BASE}?stockStatus=OUT_OF_STOCK`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);
      expect(outOfStock.body.items.every(
        (row: { stockStatus: string }) => row.stockStatus === 'OUT_OF_STOCK',
      )).toBe(true);
    });

    it('returns 400 for invalid query parameters', async () => {
      const operator = await createUser('OPERATOR');
      await request(app.getHttpServer())
        .get(`${BASE}?limit=101`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(400);
      await request(app.getHttpServer())
        .get(`${BASE}?variantId=not-a-uuid`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(400);
      await request(app.getHttpServer())
        .get(`${BASE}?stockStatus=NOPE`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(400);
    });
  });

  describe('variant-scoped inventory', () => {
    it('returns only active warehouse inventory', async () => {
      const operator = await createUser('OPERATOR');
      const res = await request(app.getHttpServer())
        .get(`${BASE}/variants/${seededVariantId}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      const whCodes = res.body.map((row: { warehouse: { code: string } }) => row.warehouse.code);
      expect(whCodes.every((code: string) => !code.includes('INACTIVE'))).toBe(true);
    });

    it('returns 404 for invalid UUID, missing and soft-deleted variants', async () => {
      const operator = await createUser('OPERATOR');

      await request(app.getHttpServer())
        .get(`${BASE}/variants/not-a-uuid`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`${BASE}/variants/${INVALID_UUID}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);

      const brand = await prisma.brand.create({
        data: { name: `b${Date.now()}`, slug: `b-${Date.now()}-${Math.random()}` },
      });
      const category = await prisma.category.create({
        data: { name: `c${Date.now()}`, slug: `c-${Date.now()}-${Math.random()}` },
      });
      const product = await prisma.product.create({
        data: {
          name: 'p',
          slug: `p-${Date.now()}-${Math.random()}`,
          brandId: brand.id,
          categoryId: category.id,
          condition: ProductCondition.NEW,
        },
      });
      const variant = await prisma.productVariant.create({
        data: { productId: product.id, sku: `S-${Date.now()}`, price: '1.00' },
      });
      brandIds.push(brand.id);
      categoryIds.push(category.id);
      productIds.push(product.id);
      variantIds.push(variant.id);
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: { deletedAt: new Date() },
      });

      await request(app.getHttpServer())
        .get(`${BASE}/variants/${variant.id}`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
    });
  });

  describe('warehouse-scoped inventory', () => {
    it('returns paginated inventory for an active warehouse', async () => {
      const operator = await createUser('OPERATOR');
      const res = await request(app.getHttpServer())
        .get(`${WH_INVENTORY}/${seededWarehouseId}/inventory?limit=1`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(200);

      expect(res.body.items.length).toBeLessThanOrEqual(1);
      expect(res.body.limit).toBe(1);
      expect(res.body.items[0].warehouseId).toBe(seededWarehouseId);
    });

    it('returns 404 for invalid UUID, missing, deleted and inactive warehouses', async () => {
      const operator = await createUser('OPERATOR');

      await request(app.getHttpServer())
        .get(`${WH_INVENTORY}/not-a-uuid/inventory`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`${WH_INVENTORY}/${INVALID_UUID}/inventory`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);

      const deleted = await prisma.warehouse.create({
        data: {
          code: `D-${Date.now()}`,
          name: 'حذف شده',
          deletedAt: new Date(),
        },
      });
      warehouseIds.push(deleted.id);
      await request(app.getHttpServer())
        .get(`${WH_INVENTORY}/${deleted.id}/inventory`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);

      const inactive = await prisma.warehouse.create({
        data: { code: `I-${Date.now()}`, name: 'غیرفعال', status: WarehouseStatus.INACTIVE },
      });
      warehouseIds.push(inactive.id);
      await request(app.getHttpServer())
        .get(`${WH_INVENTORY}/${inactive.id}/inventory`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .expect(404);
    });
  });

  describe('compatibility aggregate', () => {
    it('keeps ProductVariant.stockQuantity equal to active warehouse InventoryItem totals', async () => {
      const items = await prisma.inventoryItem.findMany({
        where: {
          variantId: seededVariantId,
          warehouse: { is: { deletedAt: null, status: WarehouseStatus.ACTIVE } },
        },
        select: { quantityOnHand: true },
      });
      const total = items.reduce((sum, row) => sum + row.quantityOnHand, 0);
      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: seededVariantId },
        select: { stockQuantity: true },
      });
      expect(total).toBe(14);
      expect(variant.stockQuantity).toBe(total);
    });
  });
});
