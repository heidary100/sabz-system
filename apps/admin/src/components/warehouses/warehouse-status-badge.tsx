import type { WarehouseStatus } from '@sabz/types'
import { Badge } from '../catalyst/badge'
import { WAREHOUSE_STATUS_LABELS } from '../../lib/warehouse-labels'

const STATUS_COLORS: Record<WarehouseStatus, 'zinc' | 'green'> = {
  ACTIVE: 'green',
  INACTIVE: 'zinc',
}

export function WarehouseStatusBadge({ status }: { status: WarehouseStatus }) {
  return <Badge color={STATUS_COLORS[status]}>{WAREHOUSE_STATUS_LABELS[status]}</Badge>
}