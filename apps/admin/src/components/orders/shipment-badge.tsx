import type { ShipmentStatus } from '@sabz/types'
import { SHIPMENT_STATUS_LABELS } from '../../lib/shipping-labels'
import { SHIPMENT_STATUS_TONES } from '../../lib/status-tones'
import { StatusBadge } from '../ui/status-badge'

export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  return (
    <StatusBadge tone={SHIPMENT_STATUS_TONES[status]}>
      {SHIPMENT_STATUS_LABELS[status]}
    </StatusBadge>
  )
}
