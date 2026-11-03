import { ConfigService } from '@nestjs/config';
import { ProductCondition, ProductStatus, WarehouseStatus } from '@prisma/client';
import {
  AuditService,
} from '../src/modules/audit/audit.service';
import { PrismaService } from '../src/common/database/prisma.service';
import { StorefrontCacheService } from '../src/common/storefront-cache/storefront-cache.service';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import { CatalogGridService } from '../src/modules/products/catalog-grid.service';
import { VariantsService } from '../src/modules/products/variants.service';

jest.setTimeout(60_000);

const ACTOR_ID = '22222222-2222-4222-8222-222222222222';

/**
 * SS-257 database integration: the batch executor against the real database.
 * Focuses on what supertest e2e cannot isolate: real row-lock contention
 * (audit §A.7 — a row locked by another transaction yields a per-row
 * CONFLICT_LOCKED outcome while unrelated rows keep succeeding), minPrice
 * maintenance, and the movement/audit bookkeeping of the reused SS-113
 * absolute-set core.
 */
describe('Admin catalog grid batch database integration (SS-257)', () => {
  let prisma: PrismaService;
  let gridService: CatalogGridService;
  let lockHolderClient: PrismaService;

  const createdBrandIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdVariantIds: string[] = [];
  const createdWarehouseIds: string[] = [];
  const createdItemIds: string[] = [];

  beforeAll(() => {
    prisma = new PrismaService();
    const audit = new AuditService(prisma);
    const cache = new StorefrontCacheService(new ConfigService());
    const variantsService = new VariantsService(prisma, audit, cache);
    const inventoryService = new InventoryService(prisma, audit, cache);
    gridService = new CatalogGridService(
      prisma,
      audit,
      cache,
      variantsService,
      inventoryService,
      new ConfigService({ LOCK_TIMEOUT_MS: '500' }),
    );
    lockHolderClient = new PrismaService();
  });

  afterAll(async () => {
    await prisma.inventoryMovement.deleteMany({
      where: { variantId: { in: createdVariantIds } },
    });
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [...createdVariantIds, ...createdItemIds] } },
    });
    await prisma.inventoryItem.deleteMany({
      where: { variantId: { in: createdVariantIds } },
    });
    await prisma.productVariant.deleteMany({
      where: { id: { in: createdVariantIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.$disconnect();
    await lockHolderClient.$disconnect();
  });

  async function createProduct(): Promise<string> {
    const brand = await prisma.brand.create({
      data: {
        name: `برند ${Date.now()}-${Math.random()}`,
        slug: `brand-gridint-${Date.now()}-${Math.random()}`,
      },
    });
    createdBrandIds.push(brand.id);
    const category = await prisma.category.create({
      data: {
        name: `دسته ${Date.now()}-${Math.random()}`,
        slug: `cat-gridint-${Date.now()}-${Math.random()}`,
      },
    });
    createdCategoryIds.push(category.id);
    const product = await prisma.product.create({
      data: {
        name: `محصول ${Date.now()}-${Math.random()}`,
        slug: `prod-gridint-${Date.now()}-${Math.random()}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
        status: ProductStatus.PUBLISHED,
      },
    });
    createdProductIds.push(product.id);
    return product.id;
  }

  async function createVariant(
    productId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku: `GRID-INT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        price: '100000.00',
        ...overrides,
      } as never,
    });
    createdVariantIds.push(variant.id);
    return variant;
  }

  async function createWarehouse(): Promise<string> {
    const warehouse = await prisma.warehouse.create({
      data: {
        code: `WH-GRIDINT-${Date.now()}-${Math.random()}`,
        name: `انبار شبکه ${Date.now()}`,
        status: WarehouseStatus.ACTIVE,
      },
    });
    createdWarehouseIds.push(warehouse.id);
    return warehouse.id;
  }

  it('a row locked by another transaction resolves as CONFLICT_LOCKED while unrelated rows succeed', async () => {
    const productId = await createProduct();
    const lockedVariant = await createVariant(productId);
    const freeVariant = await createVariant(productId);
    const warehouseId = await createWarehouse();
    await prisma.inventoryItem.create({
      data: { variantId: lockedVariant.id, warehouseId, quantityOnHand: 1 },
    });

    // Hold an uncommitted row lock on one variant from a second session.
    const holder = lockHolderClient.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ProductVariant" WHERE "id" = ${lockedVariant.id} FOR UPDATE`;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    });
    await new Promise((resolve) => setTimeout(resolve, 250));

    const response = await gridService.batch(
      {
        rows: [
          {
            variantId: lockedVariant.id,
            expectedUpdatedAt: lockedVariant.updatedAt.toISOString(),
            price: '555000.00',
          },
          {
            variantId: freeVariant.id,
            expectedUpdatedAt: freeVariant.updatedAt.toISOString(),
            price: '666000.00',
          },
        ],
      },
      ACTOR_ID,
    );

    expect(response.results[0]!.outcome).toBe('CONFLICT_LOCKED');
    expect(response.results[0]!.message).toContain('قفل');
    expect(response.results[1]!.outcome).toBe('SUCCESS');
    expect(response.summary).toEqual({ succeeded: 1, failed: 1 });

    // The locked row keeps its original value (no silent overwrite).
    const lockedAfter = await prisma.productVariant.findUnique({
      where: { id: lockedVariant.id },
    });
    expect(lockedAfter!.price.toString()).toBe('100000');
    const freeAfter = await prisma.productVariant.findUnique({
      where: { id: freeVariant.id },
    });
    expect(freeAfter!.price.toString()).toBe('666000');

    await holder;
  });

  it('maintains minPrice and writes exactly one movement + one inventory audit per successful stock write', async () => {
    const productId = await createProduct();
    const variant = await createVariant(productId, { price: '100000.00' });
    const warehouseId = await createWarehouse();
    const item = await prisma.inventoryItem.create({
      data: { variantId: variant.id, warehouseId, quantityOnHand: 5 },
    });
    createdItemIds.push(item.id);

    const response = await gridService.batch(
      {
        rows: [
          {
            variantId: variant.id,
            expectedUpdatedAt: variant.updatedAt.toISOString(),
            price: '80000.00',
            compareAtPrice: '95000.00',
            stock: 12,
          },
        ],
      },
      ACTOR_ID,
    );

    expect(response.results[0]!.outcome).toBe('SUCCESS');

    const product = await prisma.product.findUnique({ where: { id: productId } });
    expect(product!.minPrice!.toString()).toBe('80000');

    const movements = await prisma.inventoryMovement.findMany({
      where: { variantId: variant.id },
    });
    expect(movements.length).toBe(1);
    expect(movements[0]!.onHandBefore).toBe(5);
    expect(movements[0]!.onHandAfter).toBe(12);
    expect(movements[0]!.reason).toBe('ویرایش از شبکه کاتالوگ');

    const audits = await prisma.auditLog.findMany({
      where: { entityId: { in: [variant.id, item.id] } },
    });
    expect(audits.map((entry) => entry.action).sort()).toEqual([
      'INVENTORY_ADJUSTED',
      'PRODUCT_VARIANT_UPDATED',
    ]);
  });

  it('a stale stock-only row conflicts without writing while a fresh row in the same batch applies', async () => {
    const productId = await createProduct();
    const staleVariant = await createVariant(productId);
    const freshVariant = await createVariant(productId);
    const warehouseId = await createWarehouse();
    await prisma.inventoryItem.create({
      data: { variantId: staleVariant.id, warehouseId, quantityOnHand: 3 },
    });
    const freshItem = await prisma.inventoryItem.create({
      data: { variantId: freshVariant.id, warehouseId, quantityOnHand: 4 },
    });
    createdItemIds.push(freshItem.id);

    // Advance the stale variant's version behind the grid's back.
    await prisma.productVariant.update({
      where: { id: staleVariant.id },
      data: { name: 'نسخه جدید' },
    });
    const staleAfter = await prisma.productVariant.findUnique({
      where: { id: staleVariant.id },
    });
    expect(staleAfter!.updatedAt.getTime()).not.toBe(
      staleVariant.updatedAt.getTime(),
    );

    const response = await gridService.batch(
      {
        rows: [
          {
            variantId: staleVariant.id,
            expectedUpdatedAt: staleVariant.updatedAt.toISOString(),
            stock: 30,
          },
          {
            variantId: freshVariant.id,
            expectedUpdatedAt: freshVariant.updatedAt.toISOString(),
            stock: 7,
          },
        ],
      },
      ACTOR_ID,
    );

    expect(response.results[0]!.outcome).toBe('CONFLICT_CHANGED');
    expect(response.results[1]!.outcome).toBe('SUCCESS');
    expect(response.results[1]!.stock).toBe(7);

    const staleItem = await prisma.inventoryItem.findFirst({
      where: { variantId: staleVariant.id },
    });
    expect(staleItem!.quantityOnHand).toBe(3);
    expect(
      await prisma.inventoryMovement.count({ where: { variantId: staleVariant.id } }),
    ).toBe(0);
  });
});
