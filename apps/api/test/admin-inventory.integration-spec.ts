import {
  ProductCondition,
  ProductStatus,
  WarehouseStatus,
} from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import { aggregateVariantStock } from '../src/modules/inventory/inventory-aggregate';
import { bootstrap } from '../prisma/bootstrap';

jest.setTimeout(30_000);

describe('Admin inventory read API database integration (SS-112)', () => {
  let prisma: PrismaService;
  let service: InventoryService;

  const createdBrandIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdVariantIds: string[] = [];
  const createdWarehouseIds: string[] = [];
  const createdItemIds: string[] = [];

  async function createBrand(): Promise<string> {
    const brand = await prisma.brand.create({
      data: {
        name: `برند ${Date.now()}-${Math.random()}`,
        slug: `brand-invread-${Date.now()}-${Math.random()}`,
      },
    });
    createdBrandIds.push(brand.id);
    return brand.id;
  }

  async function createCategory(): Promise<string> {
    const category = await prisma.category.create({
      data: {
        name: `دسته ${Date.now()}-${Math.random()}`,
        slug: `cat-invread-${Date.now()}-${Math.random()}`,
      },
    });
    createdCategoryIds.push(category.id);
    return category.id;
  }

  async function createProduct(
    overrides: { status?: ProductStatus; deletedAt?: Date | null } = {},
  ): Promise<string> {
    const brandId = await createBrand();
    const categoryId = await createCategory();
    const product = await prisma.product.create({
      data: {
        name: `محصول ${Date.now()}-${Math.random()}`,
        slug: `prod-invread-${Date.now()}-${Math.random()}`,
        brandId,
        categoryId,
        condition: ProductCondition.NEW,
        status: overrides.status ?? ProductStatus.DRAFT,
        deletedAt: overrides.deletedAt ?? null,
      },
    });
    createdProductIds.push(product.id);
    return product.id;
  }

  async function createVariant(
    productId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku: `SKU-INVREAD-${Date.now()}-${Math.random()}`,
        price: '100.00',
        stockQuantity: 0,
        ...overrides,
      } as never,
    });
    createdVariantIds.push(variant.id);
    return variant.id;
  }

  async function createWarehouse(
    overrides: { status?: WarehouseStatus; deletedAt?: Date | null } = {},
  ): Promise<string> {
    const warehouse = await prisma.warehouse.create({
      data: {
        code: `WH-INVREAD-${Date.now()}-${Math.random()}`,
        name: `انبار تست ${Date.now()}-${Math.random()}`,
        status: overrides.status ?? WarehouseStatus.ACTIVE,
        deletedAt: overrides.deletedAt ?? null,
      },
    });
    createdWarehouseIds.push(warehouse.id);
    return warehouse.id;
  }

  async function createItem(
    variantId: string,
    warehouseId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const item = await prisma.inventoryItem.create({
      data: {
        variantId,
        warehouseId,
        quantityOnHand: 0,
        quantityReserved: 0,
        ...overrides,
      },
    });
    createdItemIds.push(item.id);
    return item.id;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    await bootstrap(prisma);
    service = new InventoryService(prisma);
  });

  afterAll(async () => {
    await prisma.inventoryMovement.deleteMany({
      where: { inventoryItemId: { in: createdItemIds } },
    });
    await prisma.reservation.deleteMany({
      where: { inventoryItemId: { in: createdItemIds } },
    });
    await prisma.inventoryItem.deleteMany({
      where: { id: { in: createdItemIds } },
    });
    await prisma.warehouse.deleteMany({
      where: { id: { in: createdWarehouseIds } },
    });
    await prisma.productVariant.deleteMany({
      where: { id: { in: createdVariantIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds } } });
    await prisma.category.deleteMany({
      where: { id: { in: createdCategoryIds } },
    });
    await prisma.$disconnect();
  });

  it('returns a paginated overview with derived available and stock status', async () => {
    const productId = await createProduct();
    const variantId = await createVariant(productId, { stockQuantity: 12 });
    const whA = await createWarehouse();
    const whB = await createWarehouse();
    await createItem(variantId, whA, {
      quantityOnHand: 10,
      quantityReserved: 2,
      reorderLevel: 5,
      criticalLevel: 2,
    });
    await createItem(variantId, whB, { quantityOnHand: 4, quantityReserved: 0 });

    const result = await service.list({});

    const ours = result.items.filter((item) => item.variantId === variantId);
    expect(ours).toHaveLength(2);
    const itemA = ours.find((item) => item.warehouseId === whA)!;
    expect(itemA.available).toBe(8);
    expect(itemA.quantityOnHand).toBe(10);
    expect(itemA.quantityReserved).toBe(2);
    expect(itemA.stockStatus).toBe('IN_STOCK');
    expect(itemA.variant.id).toBe(variantId);
    expect(itemA.warehouse.status).toBe('ACTIVE');
    expect(itemA).not.toHaveProperty('deletedAt');
    expect(itemA).not.toHaveProperty('createdBy');
    expect(itemA).not.toHaveProperty('updatedBy');
    const itemB = ours.find((item) => item.warehouseId === whB)!;
    expect(itemB.available).toBe(4);
    expect(itemB.stockStatus).toBe('IN_STOCK');
  });

  it('filters by variantId and warehouseId with AND semantics', async () => {
    const productId = await createProduct();
    const v1 = await createVariant(productId);
    const v2 = await createVariant(productId);
    const whA = await createWarehouse();
    const whB = await createWarehouse();
    await createItem(v1, whA, { quantityOnHand: 3 });
    await createItem(v1, whB, { quantityOnHand: 7 });
    await createItem(v2, whA, { quantityOnHand: 9 });

    const byVariant = await service.list({ variantId: v1 });
    expect(byVariant.items.map((item) => item.variantId)).toEqual([v1, v1]);
    expect(byVariant.total).toBe(2);

    const byWarehouse = await service.list({ warehouseId: whA });
    expect(byWarehouse.items.map((item) => item.warehouseId)).toEqual([whA, whA]);
    expect(byWarehouse.total).toBe(2);

    const both = await service.list({ variantId: v1, warehouseId: whA });
    expect(both.items).toHaveLength(1);
    expect(both.items[0]!.quantityOnHand).toBe(3);
  });

  it('searches by variant SKU and name (case-insensitive)', async () => {
    const productId = await createProduct();
    const skuVariant = await createVariant(productId, { sku: `FINDME-${Date.now()}` });
    const nameVariant = await createVariant(productId, {
      name: 'واریانت ویژه جستجو',
    });
    const whA = await createWarehouse();
    await createItem(skuVariant, whA, { quantityOnHand: 1 });
    await createItem(nameVariant, whA, { quantityOnHand: 1 });

    const bySku = await service.list({ search: 'findme' });
    expect(bySku.items.map((item) => item.variantId)).toContain(skuVariant);

    const byName = await service.list({ search: 'ویژه جستجو' });
    expect(byName.items.map((item) => item.variantId)).toContain(nameVariant);
  });

  it('filters by stockStatus', async () => {
    const productId = await createProduct();
    const low = await createVariant(productId);
    const out = await createVariant(productId);
    const ok = await createVariant(productId);
    const whA = await createWarehouse();
    await createItem(low, whA, { quantityOnHand: 5, reorderLevel: 5 });
    await createItem(out, whA, { quantityOnHand: 0 });
    await createItem(ok, whA, { quantityOnHand: 50, reorderLevel: 5 });

    const lowResult = await service.list({ stockStatus: 'LOW_STOCK' });
    expect(lowResult.items.map((item) => item.variantId)).toContain(low);
    expect(lowResult.items.map((item) => item.variantId)).not.toContain(out);
    expect(lowResult.items.map((item) => item.variantId)).not.toContain(ok);

    const outResult = await service.list({ stockStatus: 'OUT_OF_STOCK' });
    expect(outResult.items.map((item) => item.variantId)).toContain(out);

    const okResult = await service.list({ stockStatus: 'IN_STOCK' });
    expect(okResult.items.map((item) => item.variantId)).toContain(ok);
  });

  it('excludes soft-deleted variants, archived/deleted products and inactive/deleted warehouses', async () => {
    const productId = await createProduct();
    const whA = await createWarehouse();
    const deletedVariant = await createVariant(productId);
    await prisma.productVariant.update({
      where: { id: deletedVariant },
      data: { deletedAt: new Date() },
    });
    await createItem(deletedVariant, whA, { quantityOnHand: 5 });

    const archivedProduct = await createProduct({ status: ProductStatus.ARCHIVED });
    const archivedVariant = await createVariant(archivedProduct);
    await createItem(archivedVariant, whA, { quantityOnHand: 5 });

    const deletedProduct = await createProduct({ deletedAt: new Date() });
    const deletedProductVariant = await createVariant(deletedProduct);
    await createItem(deletedProductVariant, whA, { quantityOnHand: 5 });

    const inactiveWarehouse = await createWarehouse({ status: WarehouseStatus.INACTIVE });
    const activeVariant = await createVariant(productId);
    await createItem(activeVariant, inactiveWarehouse, { quantityOnHand: 5 });

    const deletedWarehouse = await createWarehouse({ deletedAt: new Date() });
    await createItem(activeVariant, deletedWarehouse, { quantityOnHand: 5 });

    const result = await service.list({});
    const ids = result.items.map((item) => item.variantId);
    expect(ids).not.toContain(deletedVariant);
    expect(ids).not.toContain(archivedVariant);
    expect(ids).not.toContain(deletedProductVariant);
    expect(ids).not.toContain(activeVariant);
  });

  it('returns per-variant inventory across active warehouses only', async () => {
    const productId = await createProduct();
    const variantId = await createVariant(productId);
    const activeWh = await createWarehouse();
    const inactiveWh = await createWarehouse({ status: WarehouseStatus.INACTIVE });
    await createItem(variantId, activeWh, { quantityOnHand: 10 });
    await createItem(variantId, inactiveWh, { quantityOnHand: 10 });

    const result = await service.listByVariant(variantId);
    expect(result).toHaveLength(1);
    expect(result[0]!.warehouseId).toBe(activeWh);
    expect(result[0]!.quantityOnHand).toBe(10);
  });

  it('returns 404 for missing, deleted or archived variants', async () => {
    const productId = await createProduct();
    const missing = '00000000-0000-4000-8000-000000000000';
    await expect(service.listByVariant(missing)).rejects.toMatchObject({
      status: 404,
    });

    const deleted = await createVariant(productId);
    await prisma.productVariant.update({
      where: { id: deleted },
      data: { deletedAt: new Date() },
    });
    await expect(service.listByVariant(deleted)).rejects.toMatchObject({
      status: 404,
    });

    const archivedProduct = await createProduct({ status: ProductStatus.ARCHIVED });
    const archivedVariant = await createVariant(archivedProduct);
    await expect(service.listByVariant(archivedVariant)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('returns paginated per-warehouse inventory', async () => {
    const productId = await createProduct();
    const v1 = await createVariant(productId);
    const v2 = await createVariant(productId);
    const v3 = await createVariant(productId);
    const whA = await createWarehouse();
    await createItem(v1, whA, { quantityOnHand: 1 });
    await createItem(v2, whA, { quantityOnHand: 2 });
    await createItem(v3, whA, { quantityOnHand: 3 });

    const result = await service.listByWarehouse(whA, { page: 1, limit: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(3);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(2);

    const page2 = await service.listByWarehouse(whA, { page: 2, limit: 2 });
    expect(page2.items).toHaveLength(1);
    const ids = [...result.items, ...page2.items].map((item) => item.variantId);
    expect(ids).toEqual(expect.arrayContaining([v1, v2, v3]));
  });

  it('returns 404 for missing, deleted or inactive warehouses', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    await expect(service.listByWarehouse(missing, {})).rejects.toMatchObject({
      status: 404,
    });

    const deleted = await createWarehouse({ deletedAt: new Date() });
    await expect(service.listByWarehouse(deleted, {})).rejects.toMatchObject({
      status: 404,
    });

    const inactive = await createWarehouse({ status: WarehouseStatus.INACTIVE });
    await expect(service.listByWarehouse(inactive, {})).rejects.toMatchObject({
      status: 404,
    });
  });

  it('computes the aggregate stockQuantity across active warehouses only', async () => {
    const productId = await createProduct();
    const variantId = await createVariant(productId, { stockQuantity: 0 });
    const whA = await createWarehouse();
    const whB = await createWarehouse();
    const inactiveWh = await createWarehouse({ status: WarehouseStatus.INACTIVE });
    await createItem(variantId, whA, { quantityOnHand: 10 });
    await createItem(variantId, whB, { quantityOnHand: 5 });
    await createItem(variantId, inactiveWh, { quantityOnHand: 100 });

    const totals = await aggregateVariantStock(prisma, [variantId]);
    expect(totals.get(variantId)).toBe(15);
  });

  it('excludes archived/deleted products and variants from the aggregate', async () => {
    const archivedProduct = await createProduct({ status: ProductStatus.ARCHIVED });
    const archivedVariant = await createVariant(archivedProduct);
    const deletedProduct = await createProduct({ deletedAt: new Date() });
    const deletedProductVariant = await createVariant(deletedProduct);
    const whA = await createWarehouse();
    await createItem(archivedVariant, whA, { quantityOnHand: 50 });
    await createItem(deletedProductVariant, whA, { quantityOnHand: 50 });

    const totals = await aggregateVariantStock(prisma, [
      archivedVariant,
      deletedProductVariant,
    ]);
    expect(totals.has(archivedVariant)).toBe(false);
    expect(totals.has(deletedProductVariant)).toBe(false);
  });

  it('defaults a variant with zero inventory items to aggregate 0', async () => {
    const productId = await createProduct();
    const variantId = await createVariant(productId, { stockQuantity: 0 });

    const totals = await aggregateVariantStock(prisma, [variantId]);
    expect(totals.get(variantId) ?? 0).toBe(0);
  });

  it('is stable across repeated aggregate computations', async () => {
    const productId = await createProduct();
    const variantId = await createVariant(productId);
    const whA = await createWarehouse();
    await createItem(variantId, whA, { quantityOnHand: 7 });

    const first = await aggregateVariantStock(prisma, [variantId]);
    const second = await aggregateVariantStock(prisma, [variantId]);
    expect(first.get(variantId)).toBe(7);
    expect(second.get(variantId)).toBe(7);
  });

  it('never mutates inventory or creates movements from read endpoints', async () => {
    const productId = await createProduct();
    const variantId = await createVariant(productId);
    const whA = await createWarehouse();
    const itemId = await createItem(variantId, whA, { quantityOnHand: 4 });

    const movementCountBefore = await prisma.inventoryMovement.count({
      where: { inventoryItemId: itemId },
    });

    await service.list({});
    await service.listByVariant(variantId);
    await service.listByWarehouse(whA, {});

    const item = await prisma.inventoryItem.findUnique({
      where: { id: itemId },
    });
    expect(item!.quantityOnHand).toBe(4);
    expect(item!.quantityReserved).toBe(0);

    const movementCountAfter = await prisma.inventoryMovement.count({
      where: { inventoryItemId: itemId },
    });
    expect(movementCountAfter).toBe(movementCountBefore);
    expect(movementCountAfter).toBe(0);
  });
});
