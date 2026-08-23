import {
  InventoryMovementType,
  ProductCondition,
  ProductStatus,
  WarehouseStatus,
} from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { InventoryService } from '../src/modules/inventory/inventory.service';

jest.setTimeout(60_000);

describe('Admin inventory history API database integration (SS-114)', () => {
  let prisma: PrismaService;
  let service: InventoryService;

  const createdBrandIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdVariantIds: string[] = [];
  const createdWarehouseIds: string[] = [];
  const createdItemIds: string[] = [];
  const createdMovementIds: string[] = [];
  const createdUserIds: string[] = [];
  const actorId = '22222222-2222-4222-8222-222222222222';
  const missingActorId = '33333333-3333-4333-8333-333333333333';

  /** Distinguishes sequential createdAt values (repository convention). */
  async function tick(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  /** Tracks items created through the SS-113 service mutation path. */
  async function trackItem(variantId: string, warehouseId: string) {
    const item = await prisma.inventoryItem.findUnique({
      where: { variantId_warehouseId: { variantId, warehouseId } },
      select: { id: true },
    });
    if (item) {
      createdItemIds.push(item.id);
    }
  }

  async function createBrand(): Promise<string> {
    const brand = await prisma.brand.create({
      data: {
        name: `برند ${Date.now()}-${Math.random()}`,
        slug: `brand-hist-${Date.now()}-${Math.random()}`,
      },
    });
    createdBrandIds.push(brand.id);
    return brand.id;
  }

  async function createCategory(): Promise<string> {
    const category = await prisma.category.create({
      data: {
        name: `دسته ${Date.now()}-${Math.random()}`,
        slug: `cat-hist-${Date.now()}-${Math.random()}`,
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
        slug: `prod-hist-${Date.now()}-${Math.random()}`,
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
        sku: `SKU-HIST-${Date.now()}-${Math.random()}`,
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
        code: `WH-HIST-${Date.now()}-${Math.random()}`,
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

  /**
   * Deterministic-history fixture: direct ledger inserts are test-only so date
   * windows and ordering can be pinned exactly. The application exposes no
   * update/delete path, so test inserts do not contradict ledger immutability.
   */
  async function insertMovement(
    itemId: string,
    variantId: string,
    warehouseId: string,
    overrides: Record<string, unknown>,
  ): Promise<string> {
    const movement = await prisma.inventoryMovement.create({
      data: {
        inventoryItemId: itemId,
        variantId,
        warehouseId,
        type: InventoryMovementType.INITIAL_STOCK,
        quantity: 1,
        reservedDelta: 0,
        reason: null,
        notes: null,
        onHandBefore: 0,
        onHandAfter: 1,
        reservedBefore: 0,
        reservedAfter: 0,
        createdBy: actorId,
        ...overrides,
      } as never,
    });
    createdMovementIds.push(movement.id);
    return movement.id;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new InventoryService(prisma, new AuditService(prisma));
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: createdItemIds } },
          { entityId: { in: createdVariantIds } },
          { userId: { in: createdUserIds } },
        ],
      },
    });
    await prisma.inventoryMovement.deleteMany({
      where: {
        OR: [
          { inventoryItemId: { in: createdItemIds } },
          { id: { in: createdMovementIds } },
        ],
      },
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
    await prisma.userProfile.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  describe('ledger produced by SS-113 mutations', () => {
    it('returns the receive and adjust movements through the history API', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();

      await service.receive(
        { variantId, warehouseId, quantity: 10, notes: 'رسید اول' },
        actorId,
      );
      await trackItem(variantId, warehouseId);
      await tick();
      await service.receive(
        { variantId, warehouseId, quantity: 5 },
        actorId,
      );
      await tick();
      await service.adjust(
        { variantId, warehouseId, quantity: 12, reason: 'تطبیق شمارش' },
        actorId,
      );

      const result = await service.listMovements({ variantId });

      expect(result.total).toBe(3);
      const types = result.items.map((movement) => movement.type);
      expect(types).toEqual([
        InventoryMovementType.MANUAL_ADJUSTMENT,
        InventoryMovementType.PURCHASE_RECEIPT,
        InventoryMovementType.INITIAL_STOCK,
      ]);
      expect(result.items[2]!.onHandBefore).toBe(0);
      expect(result.items[0]!.reason).toBe('تطبیق شمارش');
    });

    it('orders deterministically newest-first and paginates', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();

      for (const quantity of [1, 2, 3]) {
        await service.receive({ variantId, warehouseId, quantity }, actorId);
        await trackItem(variantId, warehouseId);
        await tick();
      }

      const first = await service.listMovements({ variantId, page: 1, limit: 2 });
      const second = await service.listMovements({ variantId, page: 2, limit: 2 });

      expect(first.total).toBe(3);
      expect(first.items).toHaveLength(2);
      expect(first.items[0]!.type).toBe(InventoryMovementType.PURCHASE_RECEIPT);
      expect(first.items[1]!.type).toBe(InventoryMovementType.PURCHASE_RECEIPT);
      expect(second.items).toHaveLength(1);
      expect(second.items[0]!.type).toBe(InventoryMovementType.INITIAL_STOCK);
    });
  });

  describe('filters', () => {
    let variantA: string;
    let variantB: string;
    let warehouseA: string;
    let warehouseB: string;
    let itemA: string;
    let itemB: string;

    beforeEach(async () => {
      const productA = await createProduct();
      const productB = await createProduct();
      variantA = await createVariant(productA);
      variantB = await createVariant(productB);
      warehouseA = await createWarehouse();
      warehouseB = await createWarehouse();
      itemA = await createItem(variantA, warehouseA);
      itemB = await createItem(variantB, warehouseB);
      await insertMovement(itemA, variantA, warehouseA, {
        type: InventoryMovementType.PURCHASE_RECEIPT,
      });
      await insertMovement(itemB, variantB, warehouseB, {
        type: InventoryMovementType.MANUAL_ADJUSTMENT,
        quantity: -2,
      });
    });

    it('filters by variantId', async () => {
      const result = await service.listMovements({ variantId: variantA });
      expect(result.total).toBe(1);
      expect(result.items[0]!.variantId).toBe(variantA);
    });

    it('filters by warehouseId', async () => {
      const result = await service.listMovements({ warehouseId: warehouseB });
      expect(result.total).toBe(1);
      expect(result.items[0]!.warehouseId).toBe(warehouseB);
    });

    it('filters by movement type', async () => {
      const result = await service.listMovements({
        variantId: variantB,
        type: InventoryMovementType.MANUAL_ADJUSTMENT,
      });
      expect(result.total).toBe(1);
      expect(result.items[0]!.type).toBe(InventoryMovementType.MANUAL_ADJUSTMENT);
    });

    it('combines filters with AND', async () => {
      const result = await service.listMovements({
        variantId: variantA,
        warehouseId: warehouseB,
        type: InventoryMovementType.PURCHASE_RECEIPT,
      });
      expect(result.total).toBe(0);
    });

    it('returns an empty result for a valid but nonexistent variant id', async () => {
      const missing = '00000000-0000-4000-8000-000000000000';
      const result = await service.listMovements({ variantId: missing });
      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    });
  });

  describe('date windows', () => {
    it('filters from/to inclusively on createdAt', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId);
      await insertMovement(itemId, variantId, warehouseId, {
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        quantity: 1,
      });
      await insertMovement(itemId, variantId, warehouseId, {
        createdAt: new Date('2026-08-15T00:00:00.000Z'),
        quantity: 2,
      });
      await insertMovement(itemId, variantId, warehouseId, {
        createdAt: new Date('2026-08-31T00:00:00.000Z'),
        quantity: 3,
      });

      const all = await service.listMovements({
        variantId,
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-31T00:00:00.000Z',
      });
      expect(all.total).toBe(3);

      const mid = await service.listMovements({
        variantId,
        from: '2026-08-02T00:00:00.000Z',
      });
      expect(mid.total).toBe(2);

      const until = await service.listMovements({
        variantId,
        to: '2026-08-15T00:00:00.000Z',
      });
      expect(until.total).toBe(2);

      const combined = await service.listMovements({
        variantId,
        warehouseId,
        type: InventoryMovementType.INITIAL_STOCK,
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-31T00:00:00.000Z',
      });
      expect(combined.total).toBe(3);
    });
  });

  describe('actor resolution', () => {
    it('keeps the movement and resolves actor null when the actor row is missing', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();

      await service.receive(
        { variantId, warehouseId, quantity: 1 },
        missingActorId,
      );
      await trackItem(variantId, warehouseId);

      const result = await service.listMovements({ variantId });
      expect(result.total).toBe(1);
      expect(result.items[0]!.actor).toBeNull();
    });

    it('resolves a soft-deleted actor normally', async () => {
      const user = await prisma.user.create({
        data: { mobile: `+989${Date.now()}`, status: 'ACTIVE' },
      });
      createdUserIds.push(user.id);
      await prisma.userProfile.create({
        data: { userId: user.id, firstName: 'مریم', lastName: 'کریمی' },
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { deletedAt: new Date() },
      });

      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      await service.receive({ variantId, warehouseId, quantity: 2 }, user.id);
      await trackItem(variantId, warehouseId);

      const result = await service.listMovements({ variantId });
      expect(result.total).toBe(1);
      expect(result.items[0]!.actor).toEqual({
        id: user.id,
        mobile: user.mobile,
        firstName: 'مریم',
        lastName: 'کریمی',
      });
    });
  });

  describe('data minimization and immutability', () => {
    it('never exposes reference or createdBy in the response', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      await service.receive({ variantId, warehouseId, quantity: 1 }, actorId);
      await trackItem(variantId, warehouseId);

      const result = await service.listMovements({});

      expect(result.total).toBeGreaterThan(0);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('reference');
      expect(serialized).not.toContain('createdBy');
      expect(serialized).not.toContain('deletedAt');
      expect(serialized).not.toContain('updatedBy');
    });

    it('does not mutate movement rows and leaves the ledger count unchanged', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId);
      const movementId = await insertMovement(itemId, variantId, warehouseId, {
        type: InventoryMovementType.PURCHASE_RECEIPT,
      });

      const before = await prisma.inventoryMovement.count({});
      const beforeRow = await prisma.inventoryMovement.findUniqueOrThrow({
        where: { id: movementId },
      });

      await service.listMovements({});
      await service.listMovements({ variantId });
      await service.listMovements({ type: InventoryMovementType.MANUAL_ADJUSTMENT });

      const after = await prisma.inventoryMovement.count({});
      const afterRow = await prisma.inventoryMovement.findUniqueOrThrow({
        where: { id: movementId },
      });

      expect(after).toBe(before);
      expect(afterRow).toEqual(beforeRow);
    });

    it('keeps historical movements visible after variant/product/warehouse lifecycle changes', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId);
      await insertMovement(itemId, variantId, warehouseId, {
        type: InventoryMovementType.PURCHASE_RECEIPT,
      });

      await prisma.productVariant.update({
        where: { id: variantId },
        data: { deletedAt: new Date() },
      });
      await prisma.product.update({
        where: { id: productId },
        data: { deletedAt: new Date(), status: ProductStatus.ARCHIVED },
      });
      await prisma.warehouse.update({
        where: { id: warehouseId },
        data: { deletedAt: new Date(), status: WarehouseStatus.INACTIVE },
      });

      const byVariant = await service.listMovements({ variantId });
      const byWarehouse = await service.listMovements({ warehouseId });

      expect(byVariant.total).toBe(1);
      expect(byVariant.items[0]!.variantId).toBe(variantId);
      expect(byWarehouse.total).toBe(1);
      expect(byWarehouse.items[0]!.warehouseId).toBe(warehouseId);
    });
  });
});