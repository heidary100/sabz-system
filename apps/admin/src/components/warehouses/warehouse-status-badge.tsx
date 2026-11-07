import type { WarehouseStatus } from '@sabz/types'
import { WAREHOUSE_STATUS_LABELS } from '../../lib/warehouse-labels'
import { WAREHOUSE_STATUS_TONES } from '../../lib/status-tones'
import { StatusBadge } from '../ui/status-badge'

export function WarehouseStatusBadge({ status }: { status: WarehouseStatus }) {
  return (
    <StatusBadge tone={WAREHOUSE_STATUS_TONES[status]}>
      {WAREHOUSE_STATUS_LABELS[status]}
    </StatusBadge>
  )
}
