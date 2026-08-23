import type { WarehouseStatus } from '@sabz/types'

export const WAREHOUSE_STATUS_LABELS: Record<WarehouseStatus, string> = {
  ACTIVE: 'فعال',
  INACTIVE: 'غیرفعال',
}

export const WAREHOUSE_STATUS_ORDER: WarehouseStatus[] = ['ACTIVE', 'INACTIVE']