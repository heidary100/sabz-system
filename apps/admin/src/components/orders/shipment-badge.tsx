import type { ShipmentStatus } from '@sabz/types'
import { SHIPMENT_STATUS_LABELS } from '../../lib/shipping-labels'
import { Badge } from '../catalyst/badge'

const SHIPMENT_STATUS_COLORS: Record<
  ShipmentStatus,
  'amber' | 'orange' | 'lime' | 'green' | 'zinc'
> = {
  PENDING: 'amber',
  PICKED_UP: 'orange',
  IN_TRANSIT: 'orange',
  OUT_FOR_DELIVERY: 'lime',
  DELIVERED: 'green',
  CANCELLED: 'zinc',
}

export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  return <Badge color={SHIPMENT_STATUS_COLORS[status]}>{SHIPMENT_STATUS_LABELS[status]}</Badge>
}
