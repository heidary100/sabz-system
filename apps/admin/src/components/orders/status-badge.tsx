import type { OrderStatus, PaymentStatus } from '@sabz/types'
import { ORDER_STATUS_FA, PAYMENT_STATUS_FA } from '@sabz/types'
import { Badge } from '../catalyst/badge'

const ORDER_STATUS_COLORS: Record<
  OrderStatus,
  'amber' | 'orange' | 'lime' | 'green' | 'zinc'
> = {
  PENDING: 'amber',
  PROCESSING: 'orange',
  SHIPPED: 'lime',
  DELIVERED: 'green',
  CANCELLED: 'zinc',
}

const PAYMENT_STATUS_COLORS: Record<PaymentStatus, 'amber' | 'green' | 'red'> = {
  PENDING: 'amber',
  PAID: 'green',
  FAILED: 'red',
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge color={ORDER_STATUS_COLORS[status]}>{ORDER_STATUS_FA[status]}</Badge>
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge color={PAYMENT_STATUS_COLORS[status]}>{PAYMENT_STATUS_FA[status]}</Badge>
}
