import type { InventoryStockStatus } from '@sabz/types'
import { Badge } from '../catalyst/badge'
import { INVENTORY_STOCK_STATUS_LABELS } from '../../lib/inventory-labels'

const STATUS_COLORS: Record<InventoryStockStatus, 'green' | 'amber' | 'red'> = {
  IN_STOCK: 'green',
  LOW_STOCK: 'amber',
  OUT_OF_STOCK: 'red',
}

export function InventoryStockStatusBadge({ status }: { status: InventoryStockStatus }) {
  return (
    <Badge color={STATUS_COLORS[status]}>
      {INVENTORY_STOCK_STATUS_LABELS[status]}
    </Badge>
  )
}