import { InventoryStockStatus } from '@sabz/types';
import { Prisma, ProductStatus, WarehouseStatus } from '@prisma/client';

/**
 * Derived availability: available = quantityOnHand − quantityReserved.
 *
 * Availability is never persisted. This is the single derivation used by every
 * inventory read so the API is structurally incapable of reading a stored
 * "available" value.
 */
export function deriveAvailable(
  quantityOnHand: number,
  quantityReserved: number,
): number {
  return quantityOnHand - quantityReserved;
}

export interface StockStatusSource {
  quantityOnHand: number;
  quantityReserved: number;
  reorderLevel: number | null;
  criticalLevel: number | null;
}

/**
 * Derives the operational stock status from the available quantity against the
 * configured reorder/critical levels:
 *
 * - OUT_OF_STOCK when available <= 0
 * - LOW_STOCK when available <= reorderLevel (criticalLevel is the fallback
 *   threshold when no reorderLevel is configured)
 * - IN_STOCK otherwise
 *
 * Only three statuses exist in the shared contract, so criticalLevel maps into
 * the same LOW_STOCK bucket; it never produces a fourth state.
 */
export function deriveStockStatus(item: StockStatusSource): InventoryStockStatus {
  const available = deriveAvailable(item.quantityOnHand, item.quantityReserved);
  if (available <= 0) {
    return 'OUT_OF_STOCK';
  }
  const threshold = item.reorderLevel ?? item.criticalLevel;
  if (threshold !== null && threshold !== undefined && available <= threshold) {
    return 'LOW_STOCK';
  }
  return 'IN_STOCK';
}

/**
 * Operational inventory predicate. Must stay byte-identical between the read
 * API and the aggregate so there is zero drift between authoritative
 * `InventoryItem` values and the `ProductVariant.stockQuantity` projection:
 *
 * - variant not soft-deleted
 * - owning product not soft-deleted and not ARCHIVED
 * - warehouse not soft-deleted and ACTIVE
 *
 * Inactive warehouses never contribute to operational reads or the aggregate.
 * `extraVariant` (e.g. search conditions) is merged into the variant filter and
 * combined with AND, mirroring Prisma's implicit top-level AND semantics.
 */
export function activeInventoryWhere(
  extraVariant?: Prisma.ProductVariantWhereInput,
): Prisma.InventoryItemWhereInput {
  return {
    variant: {
      is: {
        deletedAt: null,
        product: {
          is: { deletedAt: null, status: { not: ProductStatus.ARCHIVED } },
        },
        ...(extraVariant ?? {}),
      },
    },
    warehouse: { is: { deletedAt: null, status: WarehouseStatus.ACTIVE } },
  };
}

type InventoryClient = Pick<Prisma.TransactionClient, 'inventoryItem'>;

/**
 * Computes SUM(quantityOnHand) per variant across active, non-deleted
 * warehouses, using the operational predicate shared with the read API.
 *
 * Absent variants (no qualifying InventoryItem rows) are intentionally absent
 * from the returned map; callers must default to 0.
 */
export async function aggregateVariantStock(
  client: InventoryClient,
  variantIds: string[],
): Promise<Map<string, number>> {
  if (variantIds.length === 0) {
    return new Map();
  }

  const rows = await client.inventoryItem.groupBy({
    by: ['variantId'],
    where: {
      variantId: { in: variantIds },
      ...activeInventoryWhere(),
    },
    _sum: { quantityOnHand: true },
  });

  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.variantId, row._sum.quantityOnHand ?? 0);
  }
  return totals;
}
