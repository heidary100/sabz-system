import type { NotificationType } from '@sabz/types'
import { NOTIFICATION_TYPE_LABELS } from '../../lib/notification-labels'
import { Badge } from '../catalyst/badge'

const NOTIFICATION_TYPE_COLORS: Record<
  NotificationType,
  'green' | 'lime' | 'amber' | 'orange' | 'red' | 'zinc'
> = {
  ORDER_PLACED: 'green',
  ORDER_STATUS_CHANGED: 'amber',
  SHIPMENT_UPDATED: 'orange',
  RETURN_REQUESTED: 'red',
  RETURN_STATUS_CHANGED: 'amber',
  RFQ_CREATED: 'lime',
  RFQ_QUOTED: 'lime',
  RFQ_DECIDED: 'zinc',
  PARTNER_SUBMITTED: 'orange',
  PARTNER_APPROVED: 'green',
  PARTNER_REJECTED: 'red',
}

export function NotificationTypeBadge({ type }: { type: NotificationType }) {
  return (
    <Badge color={NOTIFICATION_TYPE_COLORS[type]}>
      {NOTIFICATION_TYPE_LABELS[type]}
    </Badge>
  )
}
