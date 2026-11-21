import type { DashboardCommerce, OrderStatus } from '@sabz/types'
import { ORDER_STATUS_LABELS, ORDER_STATUS_ORDER } from '../../lib/order-labels'
import { formatFaNumber } from '../../lib/format'

const SEGMENT_COLORS: Record<OrderStatus, string> = {
  PENDING: 'bg-warning',
  PROCESSING: 'bg-info',
  SHIPPED: 'bg-border-strong',
  DELIVERED: 'bg-success',
  CANCELLED: 'bg-danger',
}

/**
 * Purposeful dashboard data visualization (SS-900 Part II): a single compact
 * status mix instead of another row of plain counters. The legend always
 * repeats the value in text, so colour is never the sole carrier of meaning.
 */
export function OrderStatusMix({ commerce }: { commerce: DashboardCommerce }) {
  const total = commerce.totalOrders
  const segments = ORDER_STATUS_ORDER.map((status: OrderStatus) => ({
    status,
    count: commerce.ordersByStatus[status.toLowerCase() as keyof DashboardCommerce['ordersByStatus']],
  }))

  return (
    <div className="surface-card rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">ترکیب وضعیت سفارش‌ها</p>
        <p className="text-xs text-muted">
          {formatFaNumber(total)} سفارش
        </p>
      </div>
      <div
        role="img"
        aria-label={segments
          .map((segment) => `${ORDER_STATUS_LABELS[segment.status]}: ${formatFaNumber(segment.count)}`)
          .join('، ')}
        className="mt-3 flex h-3 overflow-hidden rounded-pill bg-surface-2 ring-1 ring-inset ring-border"
      >
        {total > 0
          ? segments
              .filter((segment) => segment.count > 0)
              .map((segment) => (
                <span
                  key={segment.status}
                  className={SEGMENT_COLORS[segment.status]}
                  style={{ width: `${(segment.count / total) * 100}%` }}
                />
              ))
          : null}
      </div>
      <ul role="list" className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {segments.map((segment) => (
          <li key={segment.status} className="flex items-center gap-1.5 text-[11px] text-muted">
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${SEGMENT_COLORS[segment.status]}`}
            />
            <span>{ORDER_STATUS_LABELS[segment.status]}</span>
            <span className="font-semibold tabular-nums text-foreground">
              {formatFaNumber(segment.count)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
