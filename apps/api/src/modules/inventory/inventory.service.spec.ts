import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  InventoryMovementType,
  ProductStatus,
  WarehouseStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from './inventory.service';

const now = new Date('2026-08-21T00:00:00.000Z');
const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    variantId: 'var-1',
    warehouseId: 'wh-1',
    quantityOnHand: 10,
    quantityReserved: 2,
    reorderLevel: null,
    criticalLevel: null,
    createdAt: now,
    variant: { id: 'var-1', sku: 'SKU-1', name: 'واریانت ۱' },
    warehouse: { id: 'wh-1', code: 'WH-01', name: 'انبار ۱', status: WarehouseStatus.ACTIVE },
    ...overrides,
  };
}

function makeVariantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'var-1',
    deletedAt: null,
    productId: 'prod-1',
    stockQuantity: 0,
    ...overrides,
  };
}

function makeProductRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    deletedAt: null,
    status: ProductStatus.DRAFT,
    ...overrides,
  };
}

function makeMovementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mov-1',
    inventoryItemId: 'item-1',
    variantId: 'var-1',
    warehouseId: 'wh-1',
    type: InventoryMovementType.INITIAL_STOCK,
    quantity: 10,
    reservedDelta: 0,
    reason: null,
    notes: null,
    onHandBefore: 0,
    onHandAfter: 10,
    reservedBefore: 0,
    reservedAfter: 0,
    createdAt: now,
    createdBy: actorId,
    ...overrides,
  };
}

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: {
    inventoryItem: {
      count: jest.Mock;
      findMany: jest.Mock;
      groupBy: jest.Mock;
      findUnique: jest.Mock;
    };
    inventoryMovement: {
      count: jest.Mock;
      findMany: jest.Mock;
    };
    productVariant: { findFirst: jest.Mock };
    warehouse: { findFirst: jest.Mock };
    user: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let tx: {
    product: { findUnique: jest.Mock };
    productVariant: { findUnique: jest.Mock; updateMany: jest.Mock };
    warehouse: { findFirst: jest.Mock; upsert: jest.Mock };
    inventoryItem: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
      groupBy: jest.Mock;
    };
    inventoryMovement: { create: jest.Mock };
    $queryRaw: jest.Mock;
  };

  beforeEach(() => {
    tx = {
      product: { findUnique: jest.fn() },
      productVariant: { findUnique: jest.fn(), updateMany: jest.fn() },
      warehouse: { findFirst: jest.fn(), upsert: jest.fn() },
      inventoryItem: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        groupBy: jest.fn(),
      },
      inventoryMovement: { create: jest.fn() },
      $queryRaw: jest.fn(),
    };
    tx.inventoryItem.groupBy.mockResolvedValue([]);
    prisma = {
      inventoryItem: {
        count: jest.fn(),
        findMany: jest.fn(),
        groupBy: jest.fn(),
        findUnique: jest.fn(),
      },
      inventoryMovement: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      productVariant: { findFirst: jest.fn() },
      warehouse: { findFirst: jest.fn() },
      user: { findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    prisma.$transaction.mockImplementation((arg: unknown) => {
      if (typeof arg === 'function') {
        return arg(tx);
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg as Promise<unknown>[]);
      }
      return arg;
    });

    service = new InventoryService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  function seedActiveVariant() {
    tx.productVariant.findUnique.mockResolvedValue(makeVariantRow());
    tx.product.findUnique.mockResolvedValue(makeProductRow());
  }

  function seedActiveWarehouse() {
    tx.warehouse.findFirst.mockResolvedValue({
      id: 'wh-1',
      status: WarehouseStatus.ACTIVE,
    });
  }

  describe('receive', () => {
    it('creates the InventoryItem and writes an INITIAL_STOCK movement on first receipt', async () => {
      seedActiveVariant();
      seedActiveWarehouse();
      tx.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      tx.inventoryItem.create.mockResolvedValue({ id: 'item-1' });
      tx.productVariant.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryItem.findUnique.mockResolvedValue(
        makeItemRow({ quantityOnHand: 10 }),
      );

      const result = await service.receive(
        { variantId: 'var-1', warehouseId: 'wh-1', quantity: 10 },
        actorId,
      );

      expect(tx.inventoryItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            variantId: 'var-1',
            warehouseId: 'wh-1',
            quantityOnHand: 10,
            quantityReserved: 0,
          }),
        }),
      );
      expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: InventoryMovementType.INITIAL_STOCK,
            quantity: 10,
            onHandBefore: 0,
            onHandAfter: 10,
            reservedDelta: 0,
            reservedBefore: 0,
            reservedAfter: 0,
            reason: null,
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INVENTORY_RECEIVED',
          entity: 'InventoryItem',
          entityId: 'item-1',
          after: expect.objectContaining({
            quantity: 10,
            onHandBefore: 0,
            onHandAfter: 10,
          }),
        }),
        tx,
      );
      expect(result.quantityOnHand).toBe(10);
    });

    it('increments an existing item with a PURCHASE_RECEIPT movement', async () => {
      seedActiveVariant();
      seedActiveWarehouse();
      tx.$queryRaw
        .mockResolvedValueOnce([{ id: 'item-1', quantityOnHand: 5 }])
        .mockResolvedValueOnce([]);
      tx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
      tx.productVariant.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryItem.findUnique.mockResolvedValue(
        makeItemRow({ quantityOnHand: 15 }),
      );

      const result = await service.receive(
        { variantId: 'var-1', warehouseId: 'wh-1', quantity: 10 },
        actorId,
      );

      expect(tx.inventoryItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { quantityOnHand: { increment: 10 }, updatedBy: actorId },
        }),
      );
      expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: InventoryMovementType.PURCHASE_RECEIPT,
            onHandBefore: 5,
            onHandAfter: 15,
          }),
        }),
      );
      expect(result.quantityOnHand).toBe(15);
      expect(tx.inventoryItem.create).not.toHaveBeenCalled();
    });

    it('throws 409 when the owning product is archived', async () => {
      tx.productVariant.findUnique.mockResolvedValue(makeVariantRow());
      tx.product.findUnique.mockResolvedValue(
        makeProductRow({ status: ProductStatus.ARCHIVED }),
      );
      seedActiveWarehouse();

      await expect(
        service.receive(
          { variantId: 'var-1', warehouseId: 'wh-1', quantity: 1 },
          actorId,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('throws 404 when the variant or product is deleted', async () => {
      tx.productVariant.findUnique.mockResolvedValue(
        makeVariantRow({ deletedAt: new Date() }),
      );
      seedActiveWarehouse();

      await expect(
        service.receive(
          { variantId: 'var-1', warehouseId: 'wh-1', quantity: 1 },
          actorId,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('throws 404 for a missing warehouse and 409 for an inactive warehouse', async () => {
      seedActiveVariant();

      tx.warehouse.findFirst.mockResolvedValue(null);
      await expect(
        service.receive(
          { variantId: 'var-1', warehouseId: 'wh-1', quantity: 1 },
          actorId,
        ),
      ).rejects.toMatchObject({ status: 404 });

      tx.warehouse.findFirst.mockResolvedValue({
        id: 'wh-1',
        status: WarehouseStatus.INACTIVE,
      });
      await expect(
        service.receive(
          { variantId: 'var-1', warehouseId: 'wh-1', quantity: 1 },
          actorId,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('rolls back the mutation when the audit write fails', async () => {
      seedActiveVariant();
      seedActiveWarehouse();
      tx.$queryRaw
        .mockResolvedValueOnce([{ id: 'item-1', quantityOnHand: 5 }])
        .mockResolvedValueOnce([]);
      tx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
      tx.productVariant.updateMany.mockResolvedValue({ count: 1 });
      audit.log.mockRejectedValueOnce(new Error('audit down'));

      await expect(
        service.receive(
          { variantId: 'var-1', warehouseId: 'wh-1', quantity: 10 },
          actorId,
        ),
      ).rejects.toThrow('audit down');
      expect(prisma.inventoryItem.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('adjust', () => {
    it('applies an absolute increase with a positive delta and MANUAL_ADJUSTMENT movement', async () => {
      seedActiveVariant();
      seedActiveWarehouse();
      tx.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-1',
        quantityOnHand: 15,
      });
      tx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
      tx.$queryRaw.mockResolvedValueOnce([]);
      tx.productVariant.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryItem.findUnique.mockResolvedValue(
        makeItemRow({ quantityOnHand: 20 }),
      );

      const result = await service.adjust(
        { variantId: 'var-1', warehouseId: 'wh-1', quantity: 20, reason: 'تطبیق' },
        actorId,
      );

      expect(tx.inventoryItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'item-1',
            quantityOnHand: 15,
          }),
          data: { quantityOnHand: 20, updatedBy: actorId },
        }),
      );
      expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: InventoryMovementType.MANUAL_ADJUSTMENT,
            quantity: 5,
            onHandBefore: 15,
            onHandAfter: 20,
            reason: 'تطبیق',
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INVENTORY_ADJUSTED',
          after: expect.objectContaining({
            requestedQuantity: 20,
            delta: 5,
            reason: 'تطبیق',
            onHandBefore: 15,
            onHandAfter: 20,
          }),
        }),
        tx,
      );
      expect(result.quantityOnHand).toBe(20);
    });

    it('applies an absolute decrease with a negative delta', async () => {
      seedActiveVariant();
      seedActiveWarehouse();
      tx.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-1',
        quantityOnHand: 15,
      });
      tx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
      tx.$queryRaw.mockResolvedValueOnce([]);
      tx.productVariant.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryItem.findUnique.mockResolvedValue(
        makeItemRow({ quantityOnHand: 12 }),
      );

      await service.adjust(
        { variantId: 'var-1', warehouseId: 'wh-1', quantity: 12, reason: 'کسر' },
        actorId,
      );

      expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quantity: -3,
            onHandBefore: 15,
            onHandAfter: 12,
          }),
        }),
      );
    });

    it('records a zero-delta movement and audit for a same-value adjust', async () => {
      seedActiveVariant();
      seedActiveWarehouse();
      tx.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-1',
        quantityOnHand: 15,
      });
      tx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
      tx.$queryRaw.mockResolvedValueOnce([]);
      tx.productVariant.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryItem.findUnique.mockResolvedValue(
        makeItemRow({ quantityOnHand: 15 }),
      );

      await service.adjust(
        { variantId: 'var-1', warehouseId: 'wh-1', quantity: 15, reason: 'تأیید' },
        actorId,
      );

      expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quantity: 0,
            onHandBefore: 15,
            onHandAfter: 15,
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalled();
    });

    it('throws 404 when no InventoryItem exists for the pair', async () => {
      seedActiveVariant();
      seedActiveWarehouse();
      tx.inventoryItem.findFirst.mockResolvedValue(null);

      await expect(
        service.adjust(
          { variantId: 'var-1', warehouseId: 'wh-1', quantity: 10, reason: 'r' },
          actorId,
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it('throws 409 when a concurrent adjust changed quantityOnHand (stale absolute set)', async () => {
      seedActiveVariant();
      seedActiveWarehouse();
      tx.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-1',
        quantityOnHand: 15,
      });
      tx.inventoryItem.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.adjust(
          { variantId: 'var-1', warehouseId: 'wh-1', quantity: 20, reason: 'r' },
          actorId,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('refreshes the aggregate stockQuantity in the same transaction', async () => {
      seedActiveVariant();
      seedActiveWarehouse();
      tx.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-1',
        quantityOnHand: 10,
      });
      tx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
      tx.$queryRaw.mockResolvedValueOnce([]);
      tx.inventoryItem.groupBy.mockResolvedValue([
        { variantId: 'var-1', _sum: { quantityOnHand: 25 } },
      ]);
      tx.productVariant.updateMany.mockResolvedValue({ count: 1 });
      prisma.inventoryItem.findUnique.mockResolvedValue(makeItemRow());

      await service.adjust(
        { variantId: 'var-1', warehouseId: 'wh-1', quantity: 25, reason: 'r' },
        actorId,
      );

      expect(tx.productVariant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'var-1', deletedAt: null },
          data: { stockQuantity: 25, updatedBy: actorId },
        }),
      );
    });

    it('rolls back when the audit write fails', async () => {
      seedActiveVariant();
      seedActiveWarehouse();
      tx.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-1',
        quantityOnHand: 10,
      });
      tx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
      tx.$queryRaw.mockResolvedValueOnce([]);
      tx.productVariant.updateMany.mockResolvedValue({ count: 1 });
      audit.log.mockRejectedValueOnce(new Error('audit down'));

      await expect(
        service.adjust(
          { variantId: 'var-1', warehouseId: 'wh-1', quantity: 5, reason: 'r' },
          actorId,
        ),
      ).rejects.toThrow('audit down');
      expect(prisma.inventoryItem.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('setVariantStockCompat', () => {
    it('writes through the inventory path (default warehouse, movement, aggregate, legacy audit)', async () => {
      seedActiveVariant();
      tx.warehouse.upsert.mockResolvedValue({ id: 'wh-default' });
      tx.warehouse.findFirst.mockResolvedValue({
        id: 'wh-default',
        status: WarehouseStatus.ACTIVE,
      });
      tx.productVariant.findUnique.mockResolvedValue(
        makeVariantRow({ stockQuantity: 1 }),
      );
      tx.inventoryItem.findFirst.mockResolvedValue(null);
      tx.inventoryItem.create.mockResolvedValue({ id: 'item-default' });
      tx.$queryRaw.mockResolvedValueOnce([]);
      tx.inventoryItem.groupBy.mockResolvedValue([
        { variantId: 'var-1', _sum: { quantityOnHand: 7 } },
      ]);
      tx.productVariant.updateMany.mockResolvedValue({ count: 1 });

      await service.setVariantStockCompat('var-1', 7, actorId);

      expect(tx.warehouse.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { code: 'DEFAULT' },
        }),
      );
      expect(tx.inventoryItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            warehouseId: 'wh-default',
            quantityOnHand: 7,
          }),
        }),
      );
      expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: InventoryMovementType.MANUAL_ADJUSTMENT,
            quantity: 7,
            onHandBefore: 0,
            onHandAfter: 7,
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PRODUCT_INVENTORY_SET',
          entity: 'ProductVariant',
          entityId: 'var-1',
          before: { stockQuantity: 1 },
          after: { stockQuantity: 7 },
        }),
        tx,
      );
    });

    it('throws 409 for an archived owning product', async () => {
      tx.productVariant.findUnique.mockResolvedValue(makeVariantRow());
      tx.product.findUnique.mockResolvedValue(
        makeProductRow({ status: ProductStatus.ARCHIVED }),
      );

      await expect(
        service.setVariantStockCompat('var-1', 5, actorId),
      ).rejects.toMatchObject({ status: 409 });
      expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it('never creates an orphan item under a deleted or inactive default warehouse', async () => {
      seedActiveVariant();
      tx.warehouse.upsert.mockResolvedValue({ id: 'wh-default' });

      tx.warehouse.findFirst.mockResolvedValue(null);
      await expect(
        service.setVariantStockCompat('var-1', 5, actorId),
      ).rejects.toMatchObject({ status: 404 });

      tx.warehouse.findFirst.mockResolvedValue({
        id: 'wh-default',
        status: WarehouseStatus.INACTIVE,
      });
      await expect(
        service.setVariantStockCompat('var-1', 5, actorId),
      ).rejects.toMatchObject({ status: 409 });

      expect(tx.inventoryItem.create).not.toHaveBeenCalled();
      expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('builds the query with default pagination, lifecycle filtering and deterministic ordering', async () => {
      prisma.inventoryItem.count.mockResolvedValue(1);
      prisma.inventoryItem.findMany.mockResolvedValue([makeItemRow()]);

      const result = await service.list({});

      expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith({
        where: {
          variant: {
            is: {
              deletedAt: null,
              product: {
                is: { deletedAt: null, status: { not: ProductStatus.ARCHIVED } },
              },
            },
          },
          warehouse: { is: { deletedAt: null, status: WarehouseStatus.ACTIVE } },
        },
        select: expect.any(Object),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 20,
      });
      expect(prisma.inventoryItem.count).toHaveBeenCalled();
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('applies page/limit pagination', async () => {
      prisma.inventoryItem.count.mockResolvedValue(0);
      prisma.inventoryItem.findMany.mockResolvedValue([]);

      await service.list({ page: 2, limit: 10 });

      expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('filters by variantId and warehouseId', async () => {
      prisma.inventoryItem.count.mockResolvedValue(0);
      prisma.inventoryItem.findMany.mockResolvedValue([]);

      await service.list({ variantId: 'var-9', warehouseId: 'wh-9' });

      const where = prisma.inventoryItem.findMany.mock.calls.at(-1)![0].where;
      expect(where.variantId).toBe('var-9');
      expect(where.warehouseId).toBe('wh-9');
      expect(where.variant).toBeDefined();
      expect(where.warehouse).toBeDefined();
    });

    it('searches by variant SKU with case-insensitive contains', async () => {
      prisma.inventoryItem.count.mockResolvedValue(0);
      prisma.inventoryItem.findMany.mockResolvedValue([]);

      await service.list({ search: 'xps' });

      const where = prisma.inventoryItem.findMany.mock.calls.at(-1)![0].where;
      expect(where.variant.is.OR).toEqual([
        { sku: { contains: 'xps', mode: 'insensitive' } },
        { name: { contains: 'xps', mode: 'insensitive' } },
      ]);
      expect(where.variant.is.deletedAt).toBeNull();
    });

    it('escapes LIKE wildcards in the search term', async () => {
      prisma.inventoryItem.count.mockResolvedValue(0);
      prisma.inventoryItem.findMany.mockResolvedValue([]);

      await service.list({ search: 'SKU_%01' });

      const where = prisma.inventoryItem.findMany.mock.calls.at(-1)![0].where;
      expect(where.variant.is.OR[0].sku.contains).toBe('SKU\\_\\%01');
    });

    it('derives availability and stock status on the summary', async () => {
      prisma.inventoryItem.count.mockResolvedValue(1);
      prisma.inventoryItem.findMany.mockResolvedValue([
        makeItemRow({ quantityOnHand: 10, quantityReserved: 2 }),
      ]);

      const result = await service.list({});
      const item = result.items[0]!;
      expect(item.available).toBe(8);
      expect(item.stockStatus).toBe('IN_STOCK');
      expect(item).not.toHaveProperty('createdBy');
      expect(item).not.toHaveProperty('updatedBy');
      expect(item).not.toHaveProperty('deletedAt');
      expect(item).not.toHaveProperty('createdAt');
    });

    it('filters by stockStatus in memory then paginates', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([
        makeItemRow({ id: 'a', quantityOnHand: 5, quantityReserved: 0, reorderLevel: 5 }),
        makeItemRow({ id: 'b', quantityOnHand: 0, quantityReserved: 0 }),
        makeItemRow({ id: 'c', quantityOnHand: 20, quantityReserved: 0 }),
      ]);

      const result = await service.list({ stockStatus: 'LOW_STOCK', page: 1, limit: 10 });

      expect(prisma.inventoryItem.count).not.toHaveBeenCalled();
      expect(result.total).toBe(1);
      expect(result.items.map((item) => item.id)).toEqual(['a']);
    });
  });

  describe('listByVariant', () => {
    it('returns inventory across active warehouses ordered by warehouse code', async () => {
      prisma.productVariant.findFirst.mockResolvedValue({ id: 'var-1' });
      prisma.inventoryItem.findMany.mockResolvedValue([
        makeItemRow({ id: 'wh-a-item', warehouseId: 'wh-a' }),
        makeItemRow({ id: 'wh-b-item', warehouseId: 'wh-b' }),
      ]);

      const result = await service.listByVariant('var-1');

      expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ variantId: 'var-1' }),
          orderBy: [{ warehouse: { code: 'asc' } }, { id: 'asc' }],
        }),
      );
      expect(result.map((item) => item.id)).toEqual(['wh-a-item', 'wh-b-item']);
    });

    it('throws 404 when the variant is missing, deleted or archived', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);
      await expect(service.listByVariant('var-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.inventoryItem.findMany).not.toHaveBeenCalled();
    });
  });

  describe('listByWarehouse', () => {
    it('returns paginated inventory for an active warehouse', async () => {
      prisma.warehouse.findFirst.mockResolvedValue({ id: 'wh-1' });
      prisma.inventoryItem.count.mockResolvedValue(1);
      prisma.inventoryItem.findMany.mockResolvedValue([makeItemRow()]);

      const result = await service.listByWarehouse('wh-1', {});

      expect(result.total).toBe(1);
      expect(result.limit).toBe(20);
      expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ warehouseId: 'wh-1' }),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: 0,
          take: 20,
        }),
      );
    });

    it('throws 404 when the warehouse is missing, deleted or inactive', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(null);
      await expect(service.listByWarehouse('wh-1', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.inventoryItem.count).not.toHaveBeenCalled();
    });
  });

  describe('listMovements', () => {
    beforeEach(() => {
      prisma.user.findMany.mockResolvedValue([]);
    });

    it('defaults to page 1 and limit 20 with skip 0', async () => {
      prisma.inventoryMovement.count.mockResolvedValue(0);
      prisma.inventoryMovement.findMany.mockResolvedValue([]);

      const result = await service.listMovements({});

      expect(result).toEqual({ items: [], total: 0, page: 1, limit: 20 });
      expect(prisma.inventoryMovement.count).toHaveBeenCalledWith({ where: {} });
      expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('honors explicit page and limit with the correct skip/take math', async () => {
      prisma.inventoryMovement.count.mockResolvedValue(1);
      prisma.inventoryMovement.findMany.mockResolvedValue([]);

      const result = await service.listMovements({ page: 3, limit: 25 });

      expect(result.page).toBe(3);
      expect(result.limit).toBe(25);
      expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 50, take: 25 }),
      );
    });

    it('filters by variantId with exact equality', async () => {
      prisma.inventoryMovement.count.mockResolvedValue(0);
      prisma.inventoryMovement.findMany.mockResolvedValue([]);

      await service.listMovements({ variantId: 'var-1' });

      expect(prisma.inventoryMovement.count).toHaveBeenCalledWith({
        where: { variantId: 'var-1' },
      });
    });

    it('filters by warehouseId with exact equality', async () => {
      prisma.inventoryMovement.count.mockResolvedValue(0);
      prisma.inventoryMovement.findMany.mockResolvedValue([]);

      await service.listMovements({ warehouseId: 'wh-1' });

      expect(prisma.inventoryMovement.count).toHaveBeenCalledWith({
        where: { warehouseId: 'wh-1' },
      });
    });

    it('filters by movement type with exact equality', async () => {
      prisma.inventoryMovement.count.mockResolvedValue(0);
      prisma.inventoryMovement.findMany.mockResolvedValue([]);

      await service.listMovements({ type: InventoryMovementType.MANUAL_ADJUSTMENT });

      expect(prisma.inventoryMovement.count).toHaveBeenCalledWith({
        where: { type: InventoryMovementType.MANUAL_ADJUSTMENT },
      });
    });

    it('filters from as an inclusive lower bound on createdAt', async () => {
      prisma.inventoryMovement.count.mockResolvedValue(0);
      prisma.inventoryMovement.findMany.mockResolvedValue([]);

      await service.listMovements({ from: '2026-08-01T00:00:00.000Z' });

      expect(prisma.inventoryMovement.count).toHaveBeenCalledWith({
        where: { createdAt: { gte: new Date('2026-08-01T00:00:00.000Z') } },
      });
    });

    it('filters to as an inclusive upper bound on createdAt', async () => {
      prisma.inventoryMovement.count.mockResolvedValue(0);
      prisma.inventoryMovement.findMany.mockResolvedValue([]);

      await service.listMovements({ to: '2026-08-31T00:00:00.000Z' });

      expect(prisma.inventoryMovement.count).toHaveBeenCalledWith({
        where: { createdAt: { lte: new Date('2026-08-31T00:00:00.000Z') } },
      });
    });

    it('combines from and to into an inclusive window', async () => {
      prisma.inventoryMovement.count.mockResolvedValue(0);
      prisma.inventoryMovement.findMany.mockResolvedValue([]);

      await service.listMovements({
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-31T00:00:00.000Z',
      });

      expect(prisma.inventoryMovement.count).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: new Date('2026-08-01T00:00:00.000Z'),
            lte: new Date('2026-08-31T00:00:00.000Z'),
          },
        },
      });
    });

    it('combines all filters with AND', async () => {
      prisma.inventoryMovement.count.mockResolvedValue(0);
      prisma.inventoryMovement.findMany.mockResolvedValue([]);

      await service.listMovements({
        variantId: 'var-1',
        warehouseId: 'wh-1',
        type: InventoryMovementType.PURCHASE_RECEIPT,
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-31T00:00:00.000Z',
      });

      expect(prisma.inventoryMovement.count).toHaveBeenCalledWith({
        where: {
          variantId: 'var-1',
          warehouseId: 'wh-1',
          type: InventoryMovementType.PURCHASE_RECEIPT,
          createdAt: {
            gte: new Date('2026-08-01T00:00:00.000Z'),
            lte: new Date('2026-08-31T00:00:00.000Z'),
          },
        },
      });
    });

    it('builds an empty where when no filter is provided', async () => {
      prisma.inventoryMovement.count.mockResolvedValue(0);
      prisma.inventoryMovement.findMany.mockResolvedValue([]);

      await service.listMovements({});

      expect(prisma.inventoryMovement.count).toHaveBeenCalledWith({ where: {} });
    });

    it('rejects a from date later than the to date', async () => {
      await expect(
        service.listMovements({
          from: '2026-08-31T00:00:00.000Z',
          to: '2026-08-01T00:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects ISO dates that do not parse into a finite instant', async () => {
      await expect(
        service.listMovements({ from: '2026-W07' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.listMovements({ to: '2026-127' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('orders deterministically by createdAt DESC then id DESC', async () => {
      prisma.inventoryMovement.count.mockResolvedValue(0);
      prisma.inventoryMovement.findMany.mockResolvedValue([]);

      await service.listMovements({});

      expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
    });

    it('returns the total from the count', async () => {
      prisma.inventoryMovement.count.mockResolvedValue(3);
      prisma.inventoryMovement.findMany.mockResolvedValue([]);

      const result = await service.listMovements({});

      expect(result.total).toBe(3);
    });

    it('maps rows to InventoryMovementSummary with ISO createdAt', async () => {
      prisma.inventoryMovement.count.mockResolvedValue(1);
      prisma.inventoryMovement.findMany.mockResolvedValue([makeMovementRow()]);
      prisma.user.findMany.mockResolvedValue([]);

      const result = await service.listMovements({});

      expect(result.items[0]).toEqual({
        id: 'mov-1',
        inventoryItemId: 'item-1',
        variantId: 'var-1',
        warehouseId: 'wh-1',
        type: InventoryMovementType.INITIAL_STOCK,
        quantity: 10,
        reservedDelta: 0,
        reason: null,
        notes: null,
        onHandBefore: 0,
        onHandAfter: 10,
        reservedBefore: 0,
        reservedAfter: 0,
        actor: null,
        createdAt: '2026-08-21T00:00:00.000Z',
      });
    });

    it('resolves the actor for an existing user', async () => {
      prisma.inventoryMovement.count.mockResolvedValue(1);
      prisma.inventoryMovement.findMany.mockResolvedValue([makeMovementRow()]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: actorId,
          mobile: '+989123456789',
          profile: { firstName: 'علی', lastName: 'احمدی' },
        },
      ]);

      const result = await service.listMovements({});

      expect(result.items[0]!.actor).toEqual({
        id: actorId,
        mobile: '+989123456789',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: [actorId] } },
        select: {
          id: true,
          mobile: true,
          profile: { select: { firstName: true, lastName: true } },
        },
      });
    });

    it('keeps the movement and sets actor null when the actor row is missing', async () => {
      prisma.inventoryMovement.count.mockResolvedValue(1);
      prisma.inventoryMovement.findMany.mockResolvedValue([makeMovementRow()]);
      prisma.user.findMany.mockResolvedValue([]);

      const result = await service.listMovements({});

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.actor).toBeNull();
    });

    it('resolves a soft-deleted actor normally', async () => {
      prisma.inventoryMovement.count.mockResolvedValue(1);
      prisma.inventoryMovement.findMany.mockResolvedValue([makeMovementRow()]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: actorId,
          mobile: '+989123456789',
          profile: null,
        },
      ]);

      const result = await service.listMovements({});

      expect(result.items[0]!.actor).toEqual({
        id: actorId,
        mobile: '+989123456789',
        firstName: null,
        lastName: null,
      });
    });

    it('does not look up users when createdBy is null', async () => {
      prisma.inventoryMovement.count.mockResolvedValue(1);
      prisma.inventoryMovement.findMany.mockResolvedValue([
        makeMovementRow({ createdBy: null }),
      ]);

      const result = await service.listMovements({});

      expect(result.items[0]!.actor).toBeNull();
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('deduplicates repeated actor ids into a single lookup', async () => {
      prisma.inventoryMovement.count.mockResolvedValue(3);
      prisma.inventoryMovement.findMany.mockResolvedValue([
        makeMovementRow({ id: 'mov-1' }),
        makeMovementRow({ id: 'mov-2' }),
        makeMovementRow({ id: 'mov-3', createdBy: null }),
      ]);

      await service.listMovements({});

      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: [actorId] } },
        select: {
          id: true,
          mobile: true,
          profile: { select: { firstName: true, lastName: true } },
        },
      });
    });

    it('selects createdBy for actor resolution but never reference', async () => {
      prisma.inventoryMovement.count.mockResolvedValue(0);
      prisma.inventoryMovement.findMany.mockResolvedValue([]);

      await service.listMovements({});

      const call = prisma.inventoryMovement.findMany.mock.calls[0]![0] as {
        select: Record<string, unknown>;
      };
      expect(call.select.createdBy).toBe(true);
      expect(call.select).not.toHaveProperty('reference');
    });

    it('never returns reference or createdBy in the response', async () => {
      prisma.inventoryMovement.count.mockResolvedValue(1);
      prisma.inventoryMovement.findMany.mockResolvedValue([makeMovementRow()]);

      const result = await service.listMovements({});

      expect(JSON.stringify(result)).not.toContain('reference');
      expect(JSON.stringify(result)).not.toContain('createdBy');
    });

    it('is a read-only path that invokes no mutation methods', async () => {
      prisma.inventoryMovement.count.mockResolvedValue(0);
      prisma.inventoryMovement.findMany.mockResolvedValue([]);

      await service.listMovements({});

      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.any(Array),
      );
      expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
      expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    });
  });
});
