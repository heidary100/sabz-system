import type { InventoryStockStatus } from '@sabz/types'
import { INVENTORY_STOCK_STATUS_LABELS } from '../../lib/inventory-labels'
import { INVENTORY_STOCK_STATUS_TONES } from '../../lib/status-tones'
import { StatusBadge } from '../ui/status-badge'

export function InventoryStockStatusBadge({ status }: { status: InventoryStockStatus }) {
  return (
    <StatusBadge tone={INVENTORY_STOCK_STATUS_TONES[status]}>
      {INVENTORY_STOCK_STATUS_LABELS[status]}
    </StatusBadge>
  )
}
