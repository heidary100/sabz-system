import type { OrderStatus, PaymentStatus } from '@sabz/types'
import { ORDER_PAYMENT_STATUS_LABELS, ORDER_STATUS_LABELS } from '../../lib/order-labels'
import { ORDER_STATUS_TONES, PAYMENT_STATUS_TONES } from '../../lib/status-tones'
import { StatusBadge } from '../ui/status-badge'

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <StatusBadge tone={ORDER_STATUS_TONES[status]}>
      {ORDER_STATUS_LABELS[status]}
    </StatusBadge>
  )
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <StatusBadge tone={PAYMENT_STATUS_TONES[status]}>
      {ORDER_PAYMENT_STATUS_LABELS[status]}
    </StatusBadge>
  )
}
