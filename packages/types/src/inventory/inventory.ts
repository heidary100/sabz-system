import type { AuditActor } from '../admin/audit';
import type {
  InventoryMovementType,
  InventoryStockStatus,
  ReservationStatus,
} from './type';
import type { WarehouseSummary } from './warehouse';

export interface InventoryVariantRef {
  id: string;
  sku: string;
  name: string | null;
}

export interface InventoryItemSummary {
  id: string;
  variantId: string;
  warehouseId: string;
  quantityOnHand: number;
  quantityReserved: number;
  available: number;
  reorderLevel: number | null;
  criticalLevel: number | null;
  stockStatus: InventoryStockStatus;
  variant: InventoryVariantRef;
  warehouse: WarehouseSummary;
}

export interface InventoryMovementSummary {
  id: string;
  inventoryItemId: string;
  variantId: string;
  warehouseId: string;
  type: InventoryMovementType;
  quantity: number;
  reservedDelta: number;
  reason: string | null;
  notes: string | null;
  onHandBefore: number;
  onHandAfter: number;
  reservedBefore: number;
  reservedAfter: number;
  actor: AuditActor | null;
  createdAt: string;
}

export interface ReservationSummary {
  id: string;
  inventoryItemId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: string | null;
  releasedAt: string | null;
  consumedAt: string | null;
  expiredAt: string | null;
  createdAt: string;
  variant: InventoryVariantRef;
  warehouse: WarehouseSummary;
}
