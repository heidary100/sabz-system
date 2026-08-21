import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  InventoryMovementType,
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
const VARIANTS = '/api/v1/admin/variants';
const INVALID_UUID = '00000000-0000-0000-0000-000000000000';

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

describe('Admin inventory mutation API (SS-113) (e2e)', () => {
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
        slug: `brand-e2e-mut-${Date.now()}-${Math.random()}`,
      },
    });
    brandIds.push(brand.id);
    const category = await prisma.category.create({
      data: {
        name: `دسته ${Date.now()}`,
        slug: `cat-e2e-mut-${Date.now()}-${Math.random()}`,
      },
    });
    categoryIds.push(category.id);
    const product = await prisma.product.create({
      data: {
        name: `محصول ${Date.now()}`,
        slug: `prod-e2e-mut-${Date.now()}-${Math.random()}`,
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
        sku: `E2E-MUT-SKU-${Date.now()}-${Math.random()}`,
        price: '100.00',
        stockQuantity: 0,
        ...overrides,
      } as never,
    });
    variantIds.push(variant.id);
    return variant.id;
  }

  async function createWarehouse(
    overrides: { status?: WarehouseStatus; deletedAt?: Date | null } = {},
  ): Promise<string> {
    const warehouse = await prisma.warehouse.create({
      data: {
        code: `E2E-MUT-WH-${Date.now()}-${Math.random()}`,
        name: 'انبار تست',
        status: overrides.status ?? WarehouseStatus.ACTIVE,
        deletedAt: overrides.deletedAt ?? null,
      },
    });
    warehouseIds.push(warehouse.id);
    return warehouse.id;
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
    it('rejects both endpoints without a token with 401', async () => {
      await request(app.getHttpServer()).post(`${BASE}/receive`).send({}).expect(401);
      await request(app.getHttpServer()).post(`${BASE}/adjust`).send({}).expect(401);
    });

    it('rejects CUSTOMER and PARTNER with 403', async () => {
      const customer = await createUser('CUSTOMER');
      const partner = await createUser('PARTNER');

      for (const token of [customer.accessToken, partner.accessToken]) {
        await request(app.getHttpServer())
          .post(`${BASE}/receive`)
          .set('Authorization', `Bearer ${token}`)
          .send({ variantId: seededVariantId, warehouseId: seededWarehouseId, quantity: 1 })
          .expect(403);
        await request(app.getHttpServer())
          .post(`${BASE}/adjust`)
          .set('Authorization', `Bearer ${token}`)
          .send({ variantId: seededVariantId, warehouseId: seededWarehouseId, quantity: 1, reason: 'r' })
          .expect(403);
      }
    });

    it('allows OPERATOR and ADMIN', async () => {
      const operator = await createUser('OPERATOR');
      const admin = await createUser('ADMIN');

      let expected = 0;
      for (const token of [operator.accessToken, admin.accessToken]) {
        expected += 1;
        const res = await request(app.getHttpServer())
          .post(`${BASE}/receive`)
          .set('Authorization', `Bearer ${token}`)
          .send({ variantId: seededVariantId, warehouseId: seededWarehouseId, quantity: 1 })
          .expect(200);
        expect(res.body.quantityOnHand).toBe(expected);
      }
    });
  });

  describe('receive', () => {
    it('creates an INITIAL_STOCK receipt on first receipt and returns the summary contract', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();

      const res = await request(app.getHttpServer())
        .post(`${BASE}/receive`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ variantId, warehouseId, quantity: 10, notes: 'رسید' })
        .expect(200);

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId_warehouseId: { variantId, warehouseId } },
      });
      itemIds.push(item.id);
      expect(res.body.id).toBe(item.id);
      expect(res.body.quantityOnHand).toBe(10);
      expect(res.body.available).toBe(10);
      expect(res.body.variant.id).toBe(variantId);
      expect(res.body.warehouse.id).toBe(warehouseId);
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('deletedAt');
      expect(serialized).not.toContain('createdBy');
      expect(serialized).not.toContain('updatedBy');
      expect(serialized).not.toContain('reference');

      const movements = await prisma.inventoryMovement.findMany({
        where: { inventoryItemId: item.id },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0]!.type).toBe(InventoryMovementType.INITIAL_STOCK);

      const audits = await prisma.auditLog.findMany({
        where: { entity: 'InventoryItem', entityId: item.id, action: 'INVENTORY_RECEIVED' },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]!.after).toMatchObject({ quantity: 10 });
    });

    it('uses PURCHASE_RECEIPT on a subsequent receipt', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();

      await request(app.getHttpServer())
        .post(`${BASE}/receive`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ variantId, warehouseId, quantity: 5 })
        .expect(200);
      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId_warehouseId: { variantId, warehouseId } },
      });
      itemIds.push(item.id);

      await request(app.getHttpServer())
        .post(`${BASE}/receive`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ variantId, warehouseId, quantity: 3 })
        .expect(200);

      const movements = await prisma.inventoryMovement.findMany({
        where: { inventoryItemId: item.id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      expect(movements.map((m) => m.type)).toEqual([
        InventoryMovementType.INITIAL_STOCK,
        InventoryMovementType.PURCHASE_RECEIPT,
      ]);

      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { stockQuantity: true },
      });
      expect(variant.stockQuantity).toBe(8);
    });

    it('returns 400 for invalid quantity and missing ids', async () => {
      const operator = await createUser('OPERATOR');

      for (const body of [
        { variantId: seededVariantId, warehouseId: seededWarehouseId, quantity: 0 },
        { variantId: seededVariantId, warehouseId: seededWarehouseId, quantity: -1 },
        { variantId: seededVariantId, warehouseId: seededWarehouseId, quantity: 1.5 },
        { variantId: seededVariantId, warehouseId: seededWarehouseId },
        { variantId: 'not-a-uuid', warehouseId: seededWarehouseId, quantity: 1 },
      ]) {
        await request(app.getHttpServer())
          .post(`${BASE}/receive`)
          .set('Authorization', `Bearer ${operator.accessToken}`)
          .send(body)
          .expect(400);
      }
    });

    it('returns 404 for missing/deleted warehouses and variants, 409 for inactive warehouses and archived products', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const inactiveWh = await createWarehouse({ status: WarehouseStatus.INACTIVE });

      await request(app.getHttpServer())
        .post(`${BASE}/receive`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ variantId, warehouseId: INVALID_UUID, quantity: 1 })
        .expect(404);
      await request(app.getHttpServer())
        .post(`${BASE}/receive`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ variantId, warehouseId: inactiveWh, quantity: 1 })
        .expect(409);

      const archivedProduct = await createProduct({ status: ProductStatus.ARCHIVED });
      const archivedVariant = await createVariant(archivedProduct);
      const activeWh = await createWarehouse();
      await request(app.getHttpServer())
        .post(`${BASE}/receive`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ variantId: archivedVariant, warehouseId: activeWh, quantity: 1 })
        .expect(409);

      const deletedProduct = await createProduct({ deletedAt: new Date() });
      const deletedProductVariant = await createVariant(deletedProduct);
      await request(app.getHttpServer())
        .post(`${BASE}/receive`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ variantId: deletedProductVariant, warehouseId: activeWh, quantity: 1 })
        .expect(404);

      const deletedVariant = await createVariant(productId, { deletedAt: new Date() });
      await request(app.getHttpServer())
        .post(`${BASE}/receive`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ variantId: deletedVariant, warehouseId: activeWh, quantity: 1 })
        .expect(404);
    });
  });

  describe('adjust', () => {
    it('applies an absolute set and returns the summary contract', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const item = await prisma.inventoryItem.create({
        data: { variantId, warehouseId, quantityOnHand: 15, quantityReserved: 0 },
      });
      itemIds.push(item.id);

      const res = await request(app.getHttpServer())
        .post(`${BASE}/adjust`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ variantId, warehouseId, quantity: 12, reason: 'تطبیق', notes: 'یادداشت' })
        .expect(200);

      expect(res.body.quantityOnHand).toBe(12);
      expect(res.body.available).toBe(12);
      expect(JSON.stringify(res.body)).not.toContain('deletedAt');
      expect(JSON.stringify(res.body)).not.toContain('createdBy');
      expect(JSON.stringify(res.body)).not.toContain('reference');

      const movements = await prisma.inventoryMovement.findMany({
        where: { inventoryItemId: item.id },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0]!.type).toBe(InventoryMovementType.MANUAL_ADJUSTMENT);
      expect(movements[0]!.quantity).toBe(-3);
      expect(movements[0]!.onHandBefore).toBe(15);
      expect(movements[0]!.onHandAfter).toBe(12);
      expect(movements[0]!.reason).toBe('تطبیق');

      const audits = await prisma.auditLog.findMany({
        where: { entity: 'InventoryItem', entityId: item.id, action: 'INVENTORY_ADJUSTED' },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]!.after).toMatchObject({
        requestedQuantity: 12,
        delta: -3,
        reason: 'تطبیق',
      });
    });

    it('returns 400 for negative quantity and missing/empty reason', async () => {
      const operator = await createUser('OPERATOR');

      for (const body of [
        { variantId: seededVariantId, warehouseId: seededWarehouseId, quantity: -1, reason: 'r' },
        { variantId: seededVariantId, warehouseId: seededWarehouseId, quantity: 1.5, reason: 'r' },
        { variantId: seededVariantId, warehouseId: seededWarehouseId, quantity: 1 },
        { variantId: seededVariantId, warehouseId: seededWarehouseId, quantity: 1, reason: '' },
        { variantId: seededVariantId, warehouseId: seededWarehouseId, quantity: 1, reason: '   ' },
        { variantId: 'not-a-uuid', warehouseId: seededWarehouseId, quantity: 1, reason: 'r' },
      ]) {
        await request(app.getHttpServer())
          .post(`${BASE}/adjust`)
          .set('Authorization', `Bearer ${operator.accessToken}`)
          .send(body)
          .expect(400);
      }
    });

    it('returns 404 for missing resources and 409 for inactive warehouse / archived product', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const inactiveWh = await createWarehouse({ status: WarehouseStatus.INACTIVE });

      await request(app.getHttpServer())
        .post(`${BASE}/adjust`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ variantId, warehouseId: INVALID_UUID, quantity: 1, reason: 'r' })
        .expect(404);
      await request(app.getHttpServer())
        .post(`${BASE}/adjust`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ variantId, warehouseId: inactiveWh, quantity: 1, reason: 'r' })
        .expect(409);

      const archivedProduct = await createProduct({ status: ProductStatus.ARCHIVED });
      const archivedVariant = await createVariant(archivedProduct);
      await request(app.getHttpServer())
        .post(`${BASE}/adjust`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ variantId: archivedVariant, warehouseId, quantity: 1, reason: 'r' })
        .expect(409);

      const missingVariant = await createVariant(productId, { deletedAt: new Date() });
      await request(app.getHttpServer())
        .post(`${BASE}/adjust`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ variantId: missingVariant, warehouseId, quantity: 1, reason: 'r' })
        .expect(404);
    });

    it('returns 404 when no InventoryItem exists for the pair', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();

      await request(app.getHttpServer())
        .post(`${BASE}/adjust`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ variantId, warehouseId, quantity: 5, reason: 'r' })
        .expect(404);
    });
  });

  describe('SS-104 compatibility endpoint', () => {
    it('still sets stock via PATCH but routes through the inventory write path', async () => {
      const operator = await createUser('OPERATOR');
      const productId = await createProduct();
      const variantId = await createVariant(productId, { stockQuantity: 1 });

      const res = await request(app.getHttpServer())
        .patch(`${VARIANTS}/${variantId}/inventory`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ stockQuantity: 7 })
        .expect(200);
      expect(res.body.stockQuantity).toBe(7);

      const defaultWarehouse = await prisma.warehouse.findUniqueOrThrow({
        where: { code: 'DEFAULT' },
      });
      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: {
          variantId_warehouseId: {
            variantId,
            warehouseId: defaultWarehouse.id,
          },
        },
      });
      itemIds.push(item.id);
      expect(item.quantityOnHand).toBe(7);

      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { stockQuantity: true },
      });
      expect(variant.stockQuantity).toBe(7);

      const movements = await prisma.inventoryMovement.findMany({
        where: { inventoryItemId: item.id },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0]!.type).toBe(InventoryMovementType.MANUAL_ADJUSTMENT);
      expect(movements[0]!.onHandBefore).toBe(0);
      expect(movements[0]!.onHandAfter).toBe(7);

      const audits = await prisma.auditLog.findMany({
        where: { entity: 'ProductVariant', entityId: variantId, action: 'PRODUCT_INVENTORY_SET' },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]!.before).toEqual({ stockQuantity: 1 });
      expect(audits[0]!.after).toEqual({ stockQuantity: 7 });
    });

    it('still rejects archived products with 409', async () => {
      const operator = await createUser('OPERATOR');
      const archivedProduct = await createProduct({ status: ProductStatus.ARCHIVED });
      const archivedVariant = await createVariant(archivedProduct);

      await request(app.getHttpServer())
        .patch(`${VARIANTS}/${archivedVariant}/inventory`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ stockQuantity: 5 })
        .expect(409);
    });
  });
});