import { ProductStatus, WarehouseStatus } from '@prisma/client';
import {
  activeInventoryWhere,
  aggregateVariantStock,
  deriveAvailable,
  deriveStockStatus,
} from './inventory-aggregate';

describe('inventory aggregate helpers', () => {
  describe('deriveAvailable', () => {
    it('computes onHand minus reserved', () => {
      expect(deriveAvailable(10, 2)).toBe(8);
      expect(deriveAvailable(0, 0)).toBe(0);
    });

    it('exposes a negative value for bad data without clamping', () => {
      expect(deriveAvailable(2, 5)).toBe(-3);
    });
  });

  describe('deriveStockStatus', () => {
    const base = { quantityOnHand: 10, quantityReserved: 0, reorderLevel: null, criticalLevel: null };

    it('returns IN_STOCK when available exceeds any threshold', () => {
      expect(deriveStockStatus({ ...base, quantityOnHand: 10 })).toBe('IN_STOCK');
    });

    it('returns OUT_OF_STOCK when available <= 0', () => {
      expect(deriveStockStatus({ ...base, quantityOnHand: 0 })).toBe('OUT_OF_STOCK');
      expect(deriveStockStatus({ ...base, quantityOnHand: 5, quantityReserved: 5 })).toBe('OUT_OF_STOCK');
    });

    it('returns LOW_STOCK when available <= reorderLevel', () => {
      expect(
        deriveStockStatus({ ...base, quantityOnHand: 10, reorderLevel: 10 }),
      ).toBe('LOW_STOCK');
      expect(
        deriveStockStatus({ ...base, quantityOnHand: 7, reorderLevel: 10, criticalLevel: 2 }),
      ).toBe('LOW_STOCK');
    });

    it('falls back to criticalLevel when reorderLevel is unset', () => {
      expect(
        deriveStockStatus({ ...base, quantityOnHand: 4, criticalLevel: 5 }),
      ).toBe('LOW_STOCK');
    });

    it('returns IN_STOCK when no threshold is configured and available > 0', () => {
      expect(deriveStockStatus(base)).toBe('IN_STOCK');
    });
  });

  describe('activeInventoryWhere', () => {
    it('excludes deleted/archived variants and products and inactive/deleted warehouses', () => {
      expect(activeInventoryWhere()).toEqual({
        variant: {
          is: {
            deletedAt: null,
            product: {
              is: { deletedAt: null, status: { not: ProductStatus.ARCHIVED } },
            },
          },
        },
        warehouse: { is: { deletedAt: null, status: WarehouseStatus.ACTIVE } },
      });
    });

    it('merges an extra variant condition alongside the lifecycle filters', () => {
      const where = activeInventoryWhere({
        OR: [{ sku: { contains: 'x', mode: 'insensitive' } }],
      });
      expect(where.variant?.is).toEqual(
        expect.objectContaining({
          deletedAt: null,
          OR: [{ sku: { contains: 'x', mode: 'insensitive' } }],
        }),
      );
    });
  });

  describe('aggregateVariantStock', () => {
    it('sums quantityOnHand per variant across qualifying items only', async () => {
      const client = {
        inventoryItem: {
          groupBy: jest.fn().mockResolvedValue([
            { variantId: 'var-1', _sum: { quantityOnHand: 25 } },
            { variantId: 'var-2', _sum: { quantityOnHand: 0 } },
          ]),
        },
      };

      const totals = await aggregateVariantStock(
        client as never,
        ['var-1', 'var-2'],
      );

      expect(client.inventoryItem.groupBy).toHaveBeenCalledWith({
        by: ['variantId'],
        where: {
          variantId: { in: ['var-1', 'var-2'] },
          ...activeInventoryWhere(),
        },
        _sum: { quantityOnHand: true },
      });
      expect(totals.get('var-1')).toBe(25);
      expect(totals.get('var-2')).toBe(0);
    });

    it('returns an empty map when no variant ids are given', async () => {
      const client = {
        inventoryItem: { groupBy: jest.fn() },
      };
      const totals = await aggregateVariantStock(client as never, []);
      expect(totals.size).toBe(0);
      expect(client.inventoryItem.groupBy).not.toHaveBeenCalled();
    });

    it('defaults missing variants to absent entries (callers map to 0)', async () => {
      const client = {
        inventoryItem: {
          groupBy: jest.fn().mockResolvedValue([
            { variantId: 'var-1', _sum: { quantityOnHand: 7 } },
          ]),
        },
      };
      const totals = await aggregateVariantStock(client as never, ['var-1', 'var-2']);
      expect(totals.get('var-1')).toBe(7);
      expect(totals.has('var-2')).toBe(false);
      expect(totals.get('var-2') ?? 0).toBe(0);
    });
  });
});
