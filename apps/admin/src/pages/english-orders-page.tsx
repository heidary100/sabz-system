import { useState } from 'react'
import type { AdminOrderTransition, OrderStatus } from '@sabz/types'
import { useOrderList } from '../hooks/use-order-list'
import type { OrderStatusFilter } from '../hooks/use-order-list'
import { transitionOrder, updateShipment } from '../services/orders'
import { translateApiError } from '../lib/error-messages'
import { Button } from '../components/catalyst/button'
import { Field, Label } from '../components/catalyst/fieldset'
import { Select } from '../components/catalyst/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/catalyst/table'
import { HorizontalScroll } from '../components/ui/horizontal-scroll'
import { Loading } from '../components/ui/loading'
import { ErrorState } from '../components/ui/error-state'

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pending review',
  PROCESSING: 'Ready for dispatch',
  SHIPPED: 'Dispatched',
  DELIVERED: 'Completed',
  CANCELLED: 'Cancelled',
}

const NEXT_TRANSITIONS: Record<OrderStatus, AdminOrderTransition[]> = {
  PENDING: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
}

const money = new Intl.NumberFormat('en-US')
const dateTime = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function statusTone(status: OrderStatus): string {
  switch (status) {
    case 'DELIVERED':
      return 'bg-success/10 text-success'
    case 'CANCELLED':
      return 'bg-danger/10 text-danger'
    case 'SHIPPED':
      return 'bg-primary-subtle text-primary'
    default:
      return 'bg-warning/10 text-warning'
  }
}

/**
 * English/LTR order operations: inline status transitions, tracking-code
 * entry, customer notes and totals. The same transition service enforces the
 * legal lifecycle, audit row and in-app notification as the Persian UI.
 */
export function EnglishOrdersPage() {
  const orders = useOrderList()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [tracking, setTracking] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function changeStatus(orderId: string, next: string): Promise<void> {
    if (!next) return
    setBusyId(orderId)
    setError(null)
    setFeedback(null)
    try {
      await transitionOrder(orderId, next as AdminOrderTransition)
      setFeedback(`Order status changed to ${STATUS_LABELS[next as OrderStatus]}.`)
      await orders.refetch()
    } catch (caught) {
      setError(translateApiError(caught))
    } finally {
      setBusyId(null)
    }
  }

  async function saveTracking(orderId: string): Promise<void> {
    const value = (tracking[orderId] ?? '').trim()
    setBusyId(orderId)
    setError(null)
    setFeedback(null)
    try {
      await updateShipment(orderId, { trackingNumber: value })
      setFeedback(value ? `Tracking code saved: ${value}` : 'Tracking code cleared.')
      await orders.refetch()
    } catch (caught) {
      setError(translateApiError(caught))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Orders</h1>
        <p className="mt-1 text-sm text-muted">
          Change status inline, enter the carrier tracking code, and read the
          customer checkout note without opening the detail page.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-64">
          <Label htmlFor="en-order-status">Status</Label>
          <Select
            id="en-order-status"
            name="order-status"
            value={orders.status}
            onChange={(event) => orders.setStatus(event.target.value as OrderStatusFilter)}
          >
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </Field>
        {feedback ? (
          <p role="status" className="rounded-control bg-success/10 px-3 py-2 text-sm text-success">
            {feedback}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>

      {orders.loading && !orders.result ? (
        <Loading label="Loading orders…" />
      ) : orders.error ? (
        <ErrorState
          message={translateApiError(orders.error)}
          onRetry={() => void orders.refetch()}
        />
      ) : !orders.result || orders.result.items.length === 0 ? (
        <div className="rounded-card border border-border bg-surface p-8 text-center text-sm text-muted">
          No orders match this status.
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <HorizontalScroll ariaLabel="Horizontally scrollable table">
            <Table dense scrollContainer={false}>
              <TableHead>
                <TableRow>
                  <TableHeader>Order</TableHeader>
                  <TableHeader>Customer</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Tracking code</TableHeader>
                  <TableHeader>Customer note</TableHeader>
                  <TableHeader>Payment</TableHeader>
                  <TableHeader>Total</TableHeader>
                  <TableHeader>Created</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.result.items.map((order) => {
                  const status = order.status as OrderStatus
                  const next = NEXT_TRANSITIONS[status] ?? []
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="font-semibold" dir="ltr">
                        #{order.orderNumber}
                      </TableCell>
                      <TableCell dir="ltr" className="text-muted">
                        {order.customerMobile}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex w-fit rounded-pill px-2 py-0.5 text-xs font-medium ${statusTone(status)}`}
                          >
                            {STATUS_LABELS[status]}
                          </span>
                          {next.length > 0 ? (
                            <select
                              aria-label={`Change status for order ${order.orderNumber}`}
                              className="rounded-md border border-border bg-surface px-1.5 py-1 text-xs text-foreground"
                              value=""
                              disabled={busyId === order.id}
                              onChange={(event) => void changeStatus(order.id, event.target.value)}
                            >
                              <option value="">Change status…</option>
                              {next.map((target) => (
                                <option key={target} value={target}>
                                  {STATUS_LABELS[target]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-[11px] text-muted">Terminal state</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <input
                            name={`tracking-${order.orderNumber}`}
                            aria-label={`Tracking code for order ${order.orderNumber}`}
                            className="w-32 rounded-md border border-border bg-surface px-1.5 py-1 text-xs"
                            placeholder="Tracking code"
                            value={tracking[order.id] ?? order.shipment?.trackingNumber ?? ''}
                            onChange={(event) =>
                              setTracking((current) => ({
                                ...current,
                                [order.id]: event.target.value,
                              }))
                            }
                          />
                          <Button
                            plain
                            disabled={busyId === order.id}
                            onClick={() => void saveTracking(order.id)}
                          >
                            Save
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-64 whitespace-normal text-xs text-muted">
                        <span title={order.note ?? undefined}>
                          {order.note ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted">
                        {order.paymentMethod === 'COD' ? 'Cash on delivery' : 'Online'}
                        {' · '}
                        {order.paymentStatus === 'PAID'
                          ? 'Paid'
                          : order.paymentStatus === 'FAILED'
                            ? 'Failed'
                            : 'Pending'}
                      </TableCell>
                      <TableCell className="tabular-nums" dir="ltr">
                        {money.format(Number(order.total))} IRR
                      </TableCell>
                      <TableCell className="text-xs text-muted">
                        {dateTime.format(new Date(order.createdAt))}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </HorizontalScroll>
        </div>
      )}
    </div>
  )
}
