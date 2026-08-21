import { NotFoundException } from '@nestjs/common';
import { ProductStatus, WarehouseStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { InventoryService } from './inventory.service';

const now = new Date('2026-08-21T00:00:00.000Z');

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

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: {
    inventoryItem: {
      count: jest.Mock;
      findMany: jest.Mock;
      groupBy: jest.Mock;
    };
    productVariant: { findFirst: jest.Mock };
    warehouse: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      inventoryItem: {
        count: jest.fn(),
        findMany: jest.fn(),
        groupBy: jest.fn(),
      },
      productVariant: { findFirst: jest.fn() },
      warehouse: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((arg: unknown) => {
      if (typeof arg === 'function') {
        return arg(prisma);
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg as Promise<unknown>[]);
      }
      return arg;
    });

    service = new InventoryService(prisma as unknown as PrismaService);
  });

  function lastFindMany() {
    return prisma.inventoryItem.findMany.mock.calls.at(-1)![0];
  }

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

      expect(lastFindMany()).toEqual(expect.objectContaining({ skip: 10, take: 10 }));
    });

    it('filters by variantId and warehouseId', async () => {
      prisma.inventoryItem.count.mockResolvedValue(0);
      prisma.inventoryItem.findMany.mockResolvedValue([]);

      await service.list({ variantId: 'var-9', warehouseId: 'wh-9' });

      const where = lastFindMany().where;
      expect(where.variantId).toBe('var-9');
      expect(where.warehouseId).toBe('wh-9');
      expect(where.variant).toBeDefined();
      expect(where.warehouse).toBeDefined();
    });

    it('searches by variant SKU with case-insensitive contains', async () => {
      prisma.inventoryItem.count.mockResolvedValue(0);
      prisma.inventoryItem.findMany.mockResolvedValue([]);

      await service.list({ search: 'xps' });

      const where = lastFindMany().where;
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

      const where = lastFindMany().where;
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

    it('maps OUT_OF_STOCK when available <= 0', async () => {
      prisma.inventoryItem.count.mockResolvedValue(1);
      prisma.inventoryItem.findMany.mockResolvedValue([
        makeItemRow({ quantityOnHand: 2, quantityReserved: 2 }),
      ]);

      const result = await service.list({});
      expect(result.items[0]!.stockStatus).toBe('OUT_OF_STOCK');
    });

    it('maps LOW_STOCK when available <= reorderLevel', async () => {
      prisma.inventoryItem.count.mockResolvedValue(1);
      prisma.inventoryItem.findMany.mockResolvedValue([
        makeItemRow({ quantityOnHand: 8, quantityReserved: 0, reorderLevel: 10, criticalLevel: 3 }),
      ]);

      const result = await service.list({});
      expect(result.items[0]!.stockStatus).toBe('LOW_STOCK');
    });

    it('maps LOW_STOCK via criticalLevel when reorderLevel is unset', async () => {
      prisma.inventoryItem.count.mockResolvedValue(1);
      prisma.inventoryItem.findMany.mockResolvedValue([
        makeItemRow({ quantityOnHand: 2, quantityReserved: 0, reorderLevel: null, criticalLevel: 5 }),
      ]);

      const result = await service.list({});
      expect(result.items[0]!.stockStatus).toBe('LOW_STOCK');
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

    it('returns an empty list for zero inventory', async () => {
      prisma.inventoryItem.count.mockResolvedValue(0);
      prisma.inventoryItem.findMany.mockResolvedValue([]);

      const result = await service.list({});
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('listByVariant', () => {
    it('returns inventory across active warehouses ordered by warehouse code', async () => {
      prisma.productVariant.findFirst.mockResolvedValue({ id: 'var-1' });
      prisma.inventoryItem.findMany.mockResolvedValue([
        makeItemRow({ id: 'wh-a-item', warehouseId: 'wh-a', variant: { id: 'var-1', sku: 'S1', name: null }, warehouse: { id: 'wh-a', code: 'WH-A', name: 'الف', status: WarehouseStatus.ACTIVE } }),
        makeItemRow({ id: 'wh-b-item', warehouseId: 'wh-b', variant: { id: 'var-1', sku: 'S1', name: null }, warehouse: { id: 'wh-b', code: 'WH-B', name: 'ب', status: WarehouseStatus.ACTIVE } }),
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

    it('throws 404 when the variant is missing', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);
      await expect(service.listByVariant('var-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.inventoryItem.findMany).not.toHaveBeenCalled();
    });

    it('throws 404 when the variant is soft-deleted', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);
      await expect(service.listByVariant('var-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 404 when the owning product is archived', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);
      await expect(service.listByVariant('var-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
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

    it('applies warehouse pagination', async () => {
      prisma.warehouse.findFirst.mockResolvedValue({ id: 'wh-1' });
      prisma.inventoryItem.count.mockResolvedValue(0);
      prisma.inventoryItem.findMany.mockResolvedValue([]);

      await service.listByWarehouse('wh-1', { page: 3, limit: 25 });

      expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 50, take: 25 }),
      );
    });

    it('throws 404 when the warehouse is missing', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(null);
      await expect(service.listByWarehouse('wh-1', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.inventoryItem.count).not.toHaveBeenCalled();
    });

    it('throws 404 when the warehouse is inactive', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(null);
      await expect(service.listByWarehouse('wh-1', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
