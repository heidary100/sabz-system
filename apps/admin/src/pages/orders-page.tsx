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
import { TablePagination } from '../components/ui/table-pagination'
import { PageHeader } from '../components/ui/page-header'
import { TableCard } from '../components/ui/table-card'

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
    refetch,
  } = useOrderList()

  const totalPages = result ? Math.max(1, Math.ceil(result.total / limit)) : 1

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
        <div className="surface-card flex flex-col items-center gap-4 rounded-xl px-6 py-16 text-center">
          <p className="text-sm/6 text-muted">{translateApiError(error)}</p>
          <Button color="primary" onClick={() => void refetch()}>
            تلاش مجدد
          </Button>
        </div>
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
            disabled={loading}
            totalLabel="سفارش"
          />
          <Table dense>
            <TableHead>
              <TableRow>
                <TableHeader>شماره سفارش</TableHeader>
                <TableHeader>مشتری</TableHeader>
                <TableHeader>وضعیت</TableHeader>
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
                    <OrderStatusBadge status={order.status} />
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

          <TablePagination
            position="bottom"
            page={page}
            totalPages={totalPages}
            total={result.total}
            onPageChange={setPage}
            disabled={loading}
            totalLabel="سفارش"
          />
        </TableCard>
      )}

      {loading && result && (
        <div className="flex items-center justify-center gap-3 py-4" role="status">
          <span
            aria-hidden="true"
            className="size-5 animate-spin rounded-full border-2 border-hunter-800 border-t-primary"
          />
          <span className="text-sm font-medium text-muted">در حال بارگذاری…</span>
        </div>
      )}

      <p className="text-xs text-muted">
        {result ? `مجموع: ${result.total} سفارش · ${limit} مورد در هر صفحه` : ''}
      </p>
    </div>
  )
}
