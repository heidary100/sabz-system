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

class FailingAuditService extends AuditService {
  override async log(): Promise<void> {
    throw new Error('audit down');
  }
}

describe('Admin inventory mutation API database integration (SS-113)', () => {
  let prisma: PrismaService;
  let service: InventoryService;
  let failingAudit: AuditService;
  let failingService: InventoryService;

  const createdBrandIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdVariantIds: string[] = [];
  const createdWarehouseIds: string[] = [];
  const createdItemIds: string[] = [];
  const actorId = '22222222-2222-4222-8222-222222222222';

  async function createBrand(): Promise<string> {
    const brand = await prisma.brand.create({
      data: {
        name: `برند ${Date.now()}-${Math.random()}`,
        slug: `brand-invmut-${Date.now()}-${Math.random()}`,
      },
    });
    createdBrandIds.push(brand.id);
    return brand.id;
  }

  async function createCategory(): Promise<string> {
    const category = await prisma.category.create({
      data: {
        name: `دسته ${Date.now()}-${Math.random()}`,
        slug: `cat-invmut-${Date.now()}-${Math.random()}`,
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
        slug: `prod-invmut-${Date.now()}-${Math.random()}`,
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
        sku: `SKU-INVMUT-${Date.now()}-${Math.random()}`,
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
        code: `WH-INVMUT-${Date.now()}-${Math.random()}`,
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

  async function findItem(variantId: string, warehouseId: string) {
    return prisma.inventoryItem.findUnique({
      where: { variantId_warehouseId: { variantId, warehouseId } },
    });
  }

  async function movementsOf(itemId: string) {
    return prisma.inventoryMovement.findMany({
      where: { inventoryItemId: itemId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async function auditsFor(itemId: string, action: string) {
    return prisma.auditLog.findMany({
      where: { entity: 'InventoryItem', entityId: itemId, action },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    service = new InventoryService(prisma, audit);
    failingAudit = new FailingAuditService(prisma);
    failingService = new InventoryService(prisma, failingAudit);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: createdItemIds } },
          { entityId: { in: createdVariantIds } },
        ],
      },
    });
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

  describe('receive', () => {
    it('creates the InventoryItem on first receipt with INITIAL_STOCK and refreshes the aggregate', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();

      const result = await service.receive(
        { variantId, warehouseId, quantity: 10, notes: 'رسید اول' },
        actorId,
      );

      const item = await findItem(variantId, warehouseId);
      expect(item).not.toBeNull();
      createdItemIds.push(item!.id);
      expect(item!.quantityOnHand).toBe(10);
      expect(item!.quantityReserved).toBe(0);
      expect(result.id).toBe(item!.id);
      expect(result.quantityOnHand).toBe(10);
      expect(result.available).toBe(10);
      expect(result.variant.id).toBe(variantId);
      expect(result.warehouse.id).toBe(warehouseId);
      expect(JSON.stringify(result)).not.toContain('deletedAt');
      expect(JSON.stringify(result)).not.toContain('createdBy');
      expect(JSON.stringify(result)).not.toContain('reference');

      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { stockQuantity: true },
      });
      expect(variant.stockQuantity).toBe(10);

      const movements = await movementsOf(item!.id);
      expect(movements).toHaveLength(1);
      expect(movements[0]!.type).toBe(InventoryMovementType.INITIAL_STOCK);
      expect(movements[0]!.quantity).toBe(10);
      expect(movements[0]!.onHandBefore).toBe(0);
      expect(movements[0]!.onHandAfter).toBe(10);
      expect(movements[0]!.reservedDelta).toBe(0);
      expect(movements[0]!.reservedBefore).toBe(0);
      expect(movements[0]!.reservedAfter).toBe(0);
      expect(movements[0]!.reason).toBeNull();
      expect(movements[0]!.notes).toBe('رسید اول');

      const audits = await auditsFor(item!.id, 'INVENTORY_RECEIVED');
      expect(audits).toHaveLength(1);
      expect(audits[0]!.userId).toBe(actorId);
      expect(audits[0]!.after).toEqual({
        variantId,
        warehouseId,
        quantity: 10,
        onHandBefore: 0,
        onHandAfter: 10,
      });
    });

    it('increments an existing item with PURCHASE_RECEIPT and keeps the aggregate in sync', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 5,
      });

      const result = await service.receive(
        { variantId, warehouseId, quantity: 10 },
        actorId,
      );

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityOnHand).toBe(15);
      expect(result.quantityOnHand).toBe(15);

      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { stockQuantity: true },
      });
      expect(variant.stockQuantity).toBe(15);

      const movements = await movementsOf(itemId);
      expect(movements).toHaveLength(1);
      expect(movements[0]!.type).toBe(InventoryMovementType.PURCHASE_RECEIPT);
      expect(movements[0]!.onHandBefore).toBe(5);
      expect(movements[0]!.onHandAfter).toBe(15);
    });

    it('rejects an inactive warehouse with 409 and an archived product with 409', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const inactiveWh = await createWarehouse({ status: WarehouseStatus.INACTIVE });

      await expect(
        service.receive({ variantId, warehouseId: inactiveWh, quantity: 1 }, actorId),
      ).rejects.toMatchObject({ status: 409 });

      const archivedProduct = await createProduct({ status: ProductStatus.ARCHIVED });
      const archivedVariant = await createVariant(archivedProduct);
      const activeWh = await createWarehouse();
      await expect(
        service.receive({ variantId: archivedVariant, warehouseId: activeWh, quantity: 1 }, actorId),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('rejects missing/deleted resources with 404', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const missing = '00000000-0000-4000-8000-000000000000';

      await expect(
        service.receive({ variantId: missing, warehouseId, quantity: 1 }, actorId),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        service.receive({ variantId, warehouseId: missing, quantity: 1 }, actorId),
      ).rejects.toMatchObject({ status: 404 });

      await prisma.productVariant.update({
        where: { id: variantId },
        data: { deletedAt: new Date() },
      });
      await expect(
        service.receive({ variantId, warehouseId, quantity: 1 }, actorId),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('rolls back item, aggregate and movement when the audit write fails', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId, { stockQuantity: 3 });
      const warehouseId = await createWarehouse();

      await expect(
        failingService.receive({ variantId, warehouseId, quantity: 5 }, actorId),
      ).rejects.toThrow('audit down');

      const item = await findItem(variantId, warehouseId);
      expect(item).toBeNull();

      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { stockQuantity: true },
      });
      expect(variant.stockQuantity).toBe(3);

      const movements = await prisma.inventoryMovement.count({
        where: { variantId, warehouseId },
      });
      expect(movements).toBe(0);
      const audits = await prisma.auditLog.count({
        where: { entityId: variantId, action: 'INVENTORY_RECEIVED' },
      });
      expect(audits).toBe(0);
    });
  });

  describe('adjust', () => {
    it('applies an absolute increase, stores the reason and syncs the aggregate', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 15,
      });

      const result = await service.adjust(
        { variantId, warehouseId, quantity: 20, reason: 'تطبیق شمارش', notes: 'یادداشت' },
        actorId,
      );

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityOnHand).toBe(20);
      expect(result.quantityOnHand).toBe(20);

      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { stockQuantity: true },
      });
      expect(variant.stockQuantity).toBe(20);

      const movements = await movementsOf(itemId);
      expect(movements).toHaveLength(1);
      expect(movements[0]!.type).toBe(InventoryMovementType.MANUAL_ADJUSTMENT);
      expect(movements[0]!.quantity).toBe(5);
      expect(movements[0]!.onHandBefore).toBe(15);
      expect(movements[0]!.onHandAfter).toBe(20);
      expect(movements[0]!.reason).toBe('تطبیق شمارش');
      expect(movements[0]!.notes).toBe('یادداشت');

      const audits = await auditsFor(itemId, 'INVENTORY_ADJUSTED');
      expect(audits).toHaveLength(1);
      expect(audits[0]!.after).toEqual({
        variantId,
        warehouseId,
        requestedQuantity: 20,
        delta: 5,
        reason: 'تطبیق شمارش',
        onHandBefore: 15,
        onHandAfter: 20,
      });
    });

    it('applies an absolute decrease with a signed negative movement', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 15,
      });

      await service.adjust(
        { variantId, warehouseId, quantity: 12, reason: 'کسر شمارش' },
        actorId,
      );

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityOnHand).toBe(12);

      const movements = await movementsOf(itemId);
      expect(movements[0]!.quantity).toBe(-3);
      expect(movements[0]!.onHandBefore).toBe(15);
      expect(movements[0]!.onHandAfter).toBe(12);
    });

    it('records a zero-delta movement and audit for an exact same-value adjust', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 15,
      });

      await service.adjust(
        { variantId, warehouseId, quantity: 15, reason: 'تأیید شمارش' },
        actorId,
      );

      const movements = await movementsOf(itemId);
      expect(movements).toHaveLength(1);
      expect(movements[0]!.quantity).toBe(0);
      expect(movements[0]!.onHandBefore).toBe(15);
      expect(movements[0]!.onHandAfter).toBe(15);

      const audits = await auditsFor(itemId, 'INVENTORY_ADJUSTED');
      expect(audits).toHaveLength(1);
      expect(audits[0]!.after).toMatchObject({ delta: 0 });
    });

    it('can set the absolute quantity to zero and never to a negative value', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 3,
      });

      await service.adjust(
        { variantId, warehouseId, quantity: 0, reason: 'صفر کردن' },
        actorId,
      );

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityOnHand).toBe(0);

      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { stockQuantity: true },
      });
      expect(variant.stockQuantity).toBe(0);
    });

    it('returns 404 when no InventoryItem exists for the pair', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();

      await expect(
        service.adjust({ variantId, warehouseId, quantity: 5, reason: 'r' }, actorId),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('rolls back the movement and aggregate when the audit write fails', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId, { stockQuantity: 3 });
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 10,
      });

      await expect(
        failingService.adjust({ variantId, warehouseId, quantity: 4, reason: 'r' }, actorId),
      ).rejects.toThrow('audit down');

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityOnHand).toBe(10);

      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { stockQuantity: true },
      });
      expect(variant.stockQuantity).toBe(3);

      expect(await movementsOf(itemId)).toHaveLength(0);
    });
  });

  describe('concurrency', () => {
    it('two concurrent receives on the same item both succeed and never drift', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 5,
      });

      const results = await Promise.allSettled([
        service.receive({ variantId, warehouseId, quantity: 10 }, actorId),
        service.receive({ variantId, warehouseId, quantity: 10 }, actorId),
      ]);
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityOnHand).toBe(25);

      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { stockQuantity: true },
      });
      expect(variant.stockQuantity).toBe(25);

      const movements = await movementsOf(itemId);
      expect(movements).toHaveLength(2);
      expect(movements.every((m) => m.type === InventoryMovementType.PURCHASE_RECEIPT)).toBe(true);
      expect(movements.reduce((sum, m) => sum + m.quantity, 0)).toBe(20);
      expect(movements[0]!.onHandBefore).toBe(5);
      expect(movements[1]!.onHandAfter).toBe(25);

      expect(await auditsFor(itemId, 'INVENTORY_RECEIVED')).toHaveLength(2);
    });

    it('concurrent first-ever receives both succeed (create race is retried)', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();

      const results = await Promise.allSettled([
        service.receive({ variantId, warehouseId, quantity: 10 }, actorId),
        service.receive({ variantId, warehouseId, quantity: 10 }, actorId),
      ]);
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

      const item = await findItem(variantId, warehouseId);
      createdItemIds.push(item!.id);
      expect(item!.quantityOnHand).toBe(20);

      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { stockQuantity: true },
      });
      expect(variant.stockQuantity).toBe(20);

      const movements = await movementsOf(item!.id);
      expect(movements).toHaveLength(2);
      expect(movements.map((m) => m.type).sort()).toEqual([
        InventoryMovementType.INITIAL_STOCK,
        InventoryMovementType.PURCHASE_RECEIPT,
      ]);
    });

    it('concurrent adjustments on the same item resolve to exactly one winner and a 409', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 10,
      });

      const results = await Promise.allSettled([
        service.adjust({ variantId, warehouseId, quantity: 15, reason: 'a' }, actorId),
        service.adjust({ variantId, warehouseId, quantity: 8, reason: 'b' }, actorId),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]).toMatchObject({ reason: { status: 409 } });

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { stockQuantity: true },
      });
      expect(item.quantityOnHand).toBe(variant.stockQuantity);
      expect(item.quantityOnHand).toBeGreaterThanOrEqual(0);

      const movements = await movementsOf(itemId);
      expect(movements).toHaveLength(1);
      expect(movements[0]!.type).toBe(InventoryMovementType.MANUAL_ADJUSTMENT);
      expect(movements[0]!.onHandAfter).toBe(item.quantityOnHand);
      expect(await auditsFor(itemId, 'INVENTORY_ADJUSTED')).toHaveLength(1);
    });

    it('a receive racing an adjust never produces negative stock or aggregate drift', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 5,
      });

      const results = await Promise.allSettled([
        service.receive({ variantId, warehouseId, quantity: 10 }, actorId),
        service.adjust({ variantId, warehouseId, quantity: 0, reason: 'صفر' }, actorId),
      ]);
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      expect(succeeded).toBeGreaterThanOrEqual(1);

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.quantityOnHand).toBeGreaterThanOrEqual(0);

      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { stockQuantity: true },
      });
      expect(variant.stockQuantity).toBe(item.quantityOnHand);

      const movements = await movementsOf(itemId);
      expect(movements).toHaveLength(succeeded);
      expect(movements.reduce((sum, m) => sum + m.quantity, 0)).toBe(
        item.quantityOnHand - 5,
      );
      const receivedMovements = movements.filter(
        (m) => m.type === InventoryMovementType.PURCHASE_RECEIPT,
      ).length;
      expect(await auditsFor(itemId, 'INVENTORY_RECEIVED')).toHaveLength(
        receivedMovements,
      );
    });

    it('a mutation racing a variant soft-delete either wins or fails cleanly with no orphan writes', async () => {
      const productId = await createProduct();
      const variantId = await createVariant(productId);
      const warehouseId = await createWarehouse();
      const itemId = await createItem(variantId, warehouseId, {
        quantityOnHand: 5,
      });

      const results = await Promise.allSettled([
        service.receive({ variantId, warehouseId, quantity: 10 }, actorId),
        prisma.productVariant.update({
          where: { id: variantId },
          data: { deletedAt: new Date() },
        }),
      ]);

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      const movements = await movementsOf(itemId);
      const audits = await prisma.auditLog.count({
        where: { entity: 'InventoryItem', entityId: itemId },
      });
      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { stockQuantity: true },
      });

      const receiveSucceeded = results[0]!.status === 'fulfilled';
      expect(movements).toHaveLength(receiveSucceeded ? 1 : 0);
      expect(audits).toBe(receiveSucceeded ? 1 : 0);
      expect(item.quantityOnHand).toBe(receiveSucceeded ? 15 : 5);
      expect(variant.stockQuantity).toBe(receiveSucceeded ? 15 : 0);
    });
  });
});