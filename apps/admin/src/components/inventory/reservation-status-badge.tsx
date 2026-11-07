import type { ReservationStatus } from '@sabz/types'
import { RESERVATION_STATUS_LABELS } from '../../lib/inventory-labels'
import { RESERVATION_STATUS_TONES } from '../../lib/status-tones'
import { StatusBadge } from '../ui/status-badge'

export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  return (
    <StatusBadge tone={RESERVATION_STATUS_TONES[status]}>
      {RESERVATION_STATUS_LABELS[status]}
    </StatusBadge>
  )
}
