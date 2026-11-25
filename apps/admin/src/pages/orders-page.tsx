import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrderList } from '../hooks/use-order-list'
import type { OrderStatusFilter } from '../hooks/use-order-list'
import { translateApiError } from '../lib/error-messages'
import { formatDate, formatRial } from '../lib/format'
import {
  ORDER_PAYMENT_METHOD_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_ORDER,
} from '../lib/order-labels'
import { OrderStatusBadge, PaymentStatusBadge } from '../components/orders/status-badge'
import { ShoppingCart } from 'lucide-react'
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
import { EmptyState } from '../components/ui/empty-state'
import { Loading } from '../components/ui/loading'
import { ErrorState } from '../components/ui/error-state'
import { TablePagination } from '../components/ui/table-pagination'
import { PageHeader } from '../components/ui/page-header'
import { TableCard } from '../components/ui/table-card'
import { HorizontalScroll } from '../components/ui/horizontal-scroll'
import { transitionOrder, updateShipment } from '../services/orders'
import { ORDER_NEXT_TRANSITIONS } from '../lib/order-labels'

export function OrdersPage() {
  const navigate = useNavigate()
  const {
    status,
    page,
    limit,
    result,
    loading,
    error,
    setStatus,
    setPage,
    setLimit,
    refetch,
  } = useOrderList()

  const [busyId, setBusyId] = useState<string | null>(null)
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, string>>({})
  const totalPages = result ? Math.max(1, Math.ceil(result.total / limit)) : 1

  async function changeStatus(orderId: string, next: string): Promise<void> {
    if (!next) return
    setBusyId(orderId)
    try {
      await transitionOrder(orderId, next as never)
      await refetch()
    } catch (error) {
      window.alert(translateApiError(error))
    } finally {
      setBusyId(null)
    }
  }

  async function saveTracking(orderId: string): Promise<void> {
    const value = (trackingDrafts[orderId] ?? '').trim()
    setBusyId(orderId)
    try {
      await updateShipment(orderId, { trackingNumber: value })
      await refetch()
    } catch (error) {
      window.alert(translateApiError(error))
    } finally {
      setBusyId(null)
    }
  }

  const openOrder = (orderId: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    navigate(`/orders/${orderId}`)
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader title="سفارش‌ها" />

      <div className="flex w-full max-w-xs items-end gap-4">
        <Field className="w-full">
          <Label>وضعیت</Label>
          <Select
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as OrderStatusFilter)}
          >
            <option value="">همه وضعیت‌ها</option>
            {ORDER_STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {ORDER_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {loading && !result ? (
        <Loading compact label="در حال بارگذاری…" />
      ) : error ? (
        <ErrorState message={translateApiError(error)} onRetry={() => void refetch()} />
      ) : !result || result.items.length === 0 ? (
        <EmptyState
          title="سفارشی یافت نشد"
          description="در این وضعیت، سفارشی ثبت نشده است."
          icon={<ShoppingCart className="size-6" aria-hidden="true" />}
          actions={
            status !== '' ? (
              <Button outline onClick={() => setStatus('')}>
                مشاهده همه سفارش‌ها
              </Button>
            ) : undefined
          }
        />
      ) : (
        <TableCard>
          <TablePagination
            position="top"
            page={page}
            totalPages={totalPages}
            total={result.total}
            onPageChange={setPage}
            limit={limit}
            limitOptions={[20, 50]}
            onLimitChange={setLimit}
            disabled={loading}
            totalLabel="سفارش"
          />
          <HorizontalScroll>
            <Table dense scrollContainer={false}>
            <TableHead>
              <TableRow>
                <TableHeader>شماره سفارش</TableHeader>
                <TableHeader>مشتری</TableHeader>
                <TableHeader>وضعیت (ویرایش سریع)</TableHeader>
                <TableHeader>کد رهگیری</TableHeader>
                <TableHeader>یادداشت مشتری</TableHeader>
                <TableHeader>پرداخت</TableHeader>
                <TableHeader>مبلغ</TableHeader>
                <TableHeader>تاریخ ثبت</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.items.map((order) => (
                <TableRow
                  key={order.id}
                  href={`/orders/${order.id}`}
                  title={`مشاهده سفارش ${order.orderNumber}`}
                  onNavigate={openOrder(order.id)}
                >
                  <TableCell className="font-medium text-foreground" dir="ltr">
                    {order.orderNumber}#
                  </TableCell>
                  <TableCell className="text-muted" dir="ltr">
                    {order.customerMobile}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <OrderStatusBadge status={order.status} />
                      {(ORDER_NEXT_TRANSITIONS[order.status] ?? []).length > 0 ? (
                        <select
                          aria-label={`تغییر وضعیت سفارش ${order.orderNumber}`}
                          className="rounded-md border border-border bg-surface px-1.5 py-1 text-xs"
                          value=""
                          disabled={busyId === order.id}
                          onChange={(event) => void changeStatus(order.id, event.target.value)}
                        >
                          <option value="">تغییر وضعیت…</option>
                          {(ORDER_NEXT_TRANSITIONS[order.status] ?? []).map((next) => (
                            <option key={next} value={next}>
                              {ORDER_STATUS_LABELS[next]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[11px] text-muted">وضعیت نهایی</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <input
                        aria-label={`کد رهگیری سفارش ${order.orderNumber}`}
                        className="w-28 rounded-md border border-border bg-surface px-1.5 py-1 text-xs"
                        dir="ltr"
                        placeholder="کد رهگیری"
                        value={trackingDrafts[order.id] ?? order.shipment?.trackingNumber ?? ''}
                        onChange={(event) =>
                          setTrackingDrafts((prev) => ({
                            ...prev,
                            [order.id]: event.target.value,
                          }))
                        }
                      />
                      <Button
                        plain
                        disabled={busyId === order.id}
                        onClick={() => void saveTracking(order.id)}
                      >
                        ثبت
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-48 whitespace-normal text-xs text-muted">
                    <span title={order.note ?? undefined}>
                      {order.note ? order.note.slice(0, 60) + (order.note.length > 60 ? '…' : '') : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <PaymentStatusBadge status={order.paymentStatus} />
                      <span className="text-xs text-muted">
                        {ORDER_PAYMENT_METHOD_LABELS[order.paymentMethod]}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted" dir="ltr">
                    {formatRial(order.total)}
                  </TableCell>
                  <TableCell className="text-muted">{formatDate(order.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            </Table>
          </HorizontalScroll>

          <TablePagination
            position="bottom"
            page={page}
            totalPages={totalPages}
            total={result.total}
            onPageChange={setPage}
            limit={limit}
            limitOptions={[20, 50]}
            onLimitChange={setLimit}
            disabled={loading}
            totalLabel="سفارش"
          />
        </TableCard>
      )}

      {loading && result && (
        <div className="flex items-center justify-center gap-3 py-4" role="status">
          <span
            aria-hidden="true"
            className="size-5 animate-spin rounded-full border-2 border-border border-t-primary"
          />
          <span className="text-sm font-medium text-muted">در حال بارگذاری…</span>
        </div>
      )}
    </div>
  )
}
