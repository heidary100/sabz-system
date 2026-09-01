import type { ReservationStatus } from '@sabz/types'
import { Badge } from '../catalyst/badge'
import { reservationStatusLabel } from '../../lib/inventory-labels'

const STATUS_COLORS: Record<ReservationStatus, 'green' | 'zinc' | 'sky' | 'red'> = {
  ACTIVE: 'green',
  RELEASED: 'zinc',
  CONSUMED: 'sky',
  EXPIRED: 'red',
}

export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  return (
    <Badge color={STATUS_COLORS[status]}>
      {reservationStatusLabel(status)}
    </Badge>
  )
}