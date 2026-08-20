export type InventoryMovementType =
  | 'INITIAL_STOCK'
  | 'PURCHASE_RECEIPT'
  | 'SALE'
  | 'RESERVATION'
  | 'RESERVATION_RELEASE'
  | 'MANUAL_ADJUSTMENT'
  | 'DAMAGE'
  | 'RETURN_RECEIVED'
  | 'RETURN_REJECTED'
  | 'STOCK_TRANSFER'
  | 'HOLO_IMPORT';

export type WarehouseStatus = 'ACTIVE' | 'INACTIVE';

export type ReservationStatus = 'ACTIVE' | 'RELEASED' | 'CONSUMED' | 'EXPIRED';

export type InventoryStockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
