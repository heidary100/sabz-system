import {
  InventoryMovementType,
  ProductCondition,
  ProductStatus,
} from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import {
  bootstrap,
  DEFAULT_WAREHOUSE_CODE,
} from '../prisma/bootstrap';

jest.setTimeout(30_000);

describe('Inventory foundation bootstrap (SS-109) integration', () => {
  let prisma: PrismaService;

  const createdBrandIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdVariantIds: string[] = [];
  let warehouseExistedBefore = false;
  let preExistingItemIds: string[] = [];

  async function createBrand(): Promise<string> {
    const brand = await prisma.brand.create({
      data: {
        name: `برند ${Date.now()}-${Math.random()}`,
        slug: `brand-inv-${Date.now()}-${Math.random()}`,
      },
    });
    createdBrandIds.push(brand.id);
    return brand.id;
  }

  async function createCategory(): Promise<string> {
    const category = await prisma.category.create({
      data: {
        name: `دسته ${Date.now()}-${Math.random()}`,
        slug: `cat-inv-${Date.now()}-${Math.random()}`,
      },
    });
    createdCategoryIds.push(category.id);
    return category.id;
  }

  async function createProduct(
    overrides: {
      status?: ProductStatus;
      deletedAt?: Date | null;
    } = {},
  ): Promise<string> {
    const brandId = await createBrand();
    const categoryId = await createCategory();
    const product = await prisma.product.create({
      data: {
        name: `محصول ${Date.now()}-${Math.random()}`,
        slug: `prod-inv-${Date.now()}-${Math.random()}`,
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
        sku: `SKU-INV-${Date.now()}-${Math.random()}`,
        price: '100.00',
        stockQuantity: 0,
        ...overrides,
      } as never,
    });
    createdVariantIds.push(variant.id);
    return variant.id;
  }

  async function defaultWarehouseId(): Promise<string> {
    const warehouse = await prisma.warehouse.findUniqueOrThrow({
      where: { code: DEFAULT_WAREHOUSE_CODE },
      select: { id: true },
    });
    return warehouse.id;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    warehouseExistedBefore =
      (await prisma.warehouse.findUnique({
        where: { code: DEFAULT_WAREHOUSE_CODE },
        select: { id: true },
      })) !== null;
    preExistingItemIds = await prisma.inventoryItem
      .findMany({ select: { id: true } })
      .then((rows) => rows.map((row) => row.id));
  });

  afterAll(async () => {
    const createdItemIds = await prisma.inventoryItem
      .findMany({
        where: { id: { notIn: preExistingItemIds } },
        select: { id: true },
      })
      .then((rows) => rows.map((row) => row.id));

    await prisma.inventoryMovement.deleteMany({
      where: { inventoryItemId: { in: createdItemIds } },
    });
    await prisma.reservation.deleteMany({
      where: { inventoryItemId: { in: createdItemIds } },
    });
    await prisma.inventoryItem.deleteMany({
      where: { id: { in: createdItemIds } },
    });

    await prisma.productVariant.deleteMany({
      where: { id: { in: createdVariantIds } },
    });
    const orphanProducts = await prisma.product.findMany({
      where: {
        OR: [
          { brandId: { in: createdBrandIds } },
          { categoryId: { in: createdCategoryIds } },
        ],
      },
      select: { id: true },
    });
    const orphanIds = orphanProducts.map((row) => row.id);
    await prisma.productVariant.deleteMany({
      where: { productId: { in: orphanIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: orphanIds } } });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });

    const remainingItemCount = await prisma.inventoryItem.count();
    if (!warehouseExistedBefore && remainingItemCount === 0) {
      await prisma.warehouse.deleteMany({
        where: { code: DEFAULT_WAREHOUSE_CODE },
      });
    }

    await prisma.$disconnect();
  });

  it('ensures the default warehouse and backfills existing variants exactly once', async () => {
    const productId = await createProduct();
    const variantA = await createVariant(productId, { stockQuantity: 10 });
    const variantB = await createVariant(productId, { stockQuantity: 0 });

    await bootstrap(prisma);

    const warehouse = await prisma.warehouse.findUnique({
      where: { code: DEFAULT_WAREHOUSE_CODE },
    });
    expect(warehouse).not.toBeNull();
    expect(warehouse!.status).toBe('ACTIVE');

    const warehouseId = warehouse!.id;
    const items = await prisma.inventoryItem.findMany({
      where: { variantId: { in: [variantA, variantB] } },
    });
    expect(items).toHaveLength(2);
    const itemA = items.find((item) => item.variantId === variantA);
    const itemB = items.find((item) => item.variantId === variantB);
    expect(itemA?.quantityOnHand).toBe(10);
    expect(itemA?.quantityReserved).toBe(0);
    expect(itemA?.warehouseId).toBe(warehouseId);
    expect(itemB?.quantityOnHand).toBe(0);
    expect(itemB?.quantityReserved).toBe(0);

    const movements = await prisma.inventoryMovement.findMany({
      where: { inventoryItemId: { in: items.map((item) => item.id) } },
    });
    expect(movements).toHaveLength(2);
    const movementA = movements.find(
      (movement) => movement.inventoryItemId === itemA!.id,
    );
    const movementB = movements.find(
      (movement) => movement.inventoryItemId === itemB!.id,
    );
    expect(movementA?.type).toBe(InventoryMovementType.INITIAL_STOCK);
    expect(movementA?.quantity).toBe(10);
    expect(movementA?.onHandBefore).toBe(0);
    expect(movementA?.onHandAfter).toBe(10);
    expect(movementB?.type).toBe(InventoryMovementType.INITIAL_STOCK);
    expect(movementB?.quantity).toBe(0);
    expect(movementB?.onHandAfter).toBe(0);

    const variantArow = await prisma.productVariant.findUnique({
      where: { id: variantA },
    });
    const variantBrow = await prisma.productVariant.findUnique({
      where: { id: variantB },
    });
    expect(variantArow?.stockQuantity).toBe(10);
    expect(variantBrow?.stockQuantity).toBe(0);
  });

  it('is idempotent: repeated bootstrap adds no items or movements', async () => {
    const productId = await createProduct();
    const variant = await createVariant(productId, { stockQuantity: 7 });

    await bootstrap(prisma);
    await bootstrap(prisma);

    const items = await prisma.inventoryItem.findMany({
      where: { variantId: variant },
    });
    expect(items).toHaveLength(1);

    const movements = await prisma.inventoryMovement.findMany({
      where: { inventoryItemId: items[0]!.id },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]!.type).toBe(InventoryMovementType.INITIAL_STOCK);
    expect(movements[0]!.quantity).toBe(7);

    const variantRow = await prisma.productVariant.findUnique({
      where: { id: variant },
    });
    expect(variantRow?.stockQuantity).toBe(7);
  });

  it('skips soft-deleted variants and archived or deleted product variants', async () => {
    const activeProductId = await createProduct();
    const softDeletedVariant = await createVariant(activeProductId, {
      stockQuantity: 5,
    });
    await prisma.productVariant.update({
      where: { id: softDeletedVariant },
      data: { deletedAt: new Date() },
    });

    const archivedProductId = await createProduct({
      status: ProductStatus.ARCHIVED,
    });
    const archivedVariant = await createVariant(archivedProductId, {
      stockQuantity: 5,
    });

    const deletedProductId = await createProduct({ deletedAt: new Date() });
    const deletedProductVariant = await createVariant(deletedProductId, {
      stockQuantity: 5,
    });

    await bootstrap(prisma);

    const items = await prisma.inventoryItem.findMany({
      where: {
        variantId: {
          in: [softDeletedVariant, archivedVariant, deletedProductVariant],
        },
      },
    });
    expect(items).toHaveLength(0);

    for (const id of [softDeletedVariant, archivedVariant, deletedProductVariant]) {
      const movements = await prisma.inventoryMovement.findMany({
        where: { variantId: id },
      });
      expect(movements).toHaveLength(0);
    }
  });

  it('enforces the (variantId, warehouseId) unique constraint', async () => {
    const productId = await createProduct();
    const variant = await createVariant(productId, { stockQuantity: 3 });
    await bootstrap(prisma);

    const warehouseId = await defaultWarehouseId();
    await expect(
      prisma.inventoryItem.create({
        data: {
          warehouseId,
          variantId: variant,
          quantityOnHand: 3,
          quantityReserved: 0,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('keeps the movement ledger structurally immutable (no update/delete columns)', async () => {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'InventoryMovement'
    `;
    const names = columns.map((row) => row.column_name);
    expect(names).not.toContain('updatedAt');
    expect(names).not.toContain('updatedBy');
    expect(names).not.toContain('deletedAt');
  });

  it('handles an empty eligible variant set without side effects', async () => {
    const productId = await createProduct();
    const variant = await createVariant(productId, { stockQuantity: 4 });

    await bootstrap(prisma);
    const itemsBefore = await prisma.inventoryItem.findMany({
      where: { variantId: variant },
    });
    expect(itemsBefore).toHaveLength(1);

    await prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.ARCHIVED },
    });
    await bootstrap(prisma);

    const itemsAfter = await prisma.inventoryItem.findMany({
      where: { variantId: variant },
    });
    expect(itemsAfter).toHaveLength(1);
  });
});
