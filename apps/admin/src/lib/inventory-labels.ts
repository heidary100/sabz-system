import type { InventoryMovementType, InventoryStockStatus } from '@sabz/types'

export const INVENTORY_STOCK_STATUS_LABELS: Record<InventoryStockStatus, string> = {
  IN_STOCK: 'موجود',
  LOW_STOCK: 'موجودی کم',
  OUT_OF_STOCK: 'ناموجود',
}

export const INVENTORY_STOCK_STATUS_ORDER: InventoryStockStatus[] = [
  'IN_STOCK',
  'LOW_STOCK',
  'OUT_OF_STOCK',
]

export const INVENTORY_MOVEMENT_TYPE_LABELS: Record<InventoryMovementType, string> = {
  INITIAL_STOCK: 'موجودی اولیه',
  PURCHASE_RECEIPT: 'رسید خرید',
  SALE: 'فروش',
  RESERVATION: 'رزرو',
  RESERVATION_RELEASE: 'آزادسازی رزرو',
  MANUAL_ADJUSTMENT: 'اصلاح دستی',
  DAMAGE: 'خسارت',
  RETURN_RECEIVED: 'مرجوعی دریافتی',
  RETURN_REJECTED: 'مرجوعی ردشده',
  STOCK_TRANSFER: 'انتقال موجودی',
  HOLO_IMPORT: 'واردات هولو',
}

export const INVENTORY_MOVEMENT_TYPE_ORDER: InventoryMovementType[] = [
  'PURCHASE_RECEIPT',
  'INITIAL_STOCK',
  'MANUAL_ADJUSTMENT',
  'SALE',
  'RESERVATION',
  'RESERVATION_RELEASE',
  'DAMAGE',
  'RETURN_RECEIVED',
  'RETURN_REJECTED',
  'STOCK_TRANSFER',
  'HOLO_IMPORT',
]

export function movementTypeLabel(type: InventoryMovementType): string {
  return INVENTORY_MOVEMENT_TYPE_LABELS[type] ?? type
}