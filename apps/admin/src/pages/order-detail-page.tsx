import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { AdminOrderTransition } from '@sabz/types'
import { ORDER_STATUS_FA, PAYMENT_METHOD_FA } from '@sabz/types'
import { useOrderDetail } from '../hooks/use-order-detail'
import { translateApiError } from '../lib/error-messages'
import { formatDateTime, formatRial } from '../lib/format'
import {
  ORDER_NEXT_TRANSITIONS,
  ORDER_TRANSITION_DESCRIPTIONS,
  ORDER_TRANSITION_LABELS,
} from '../lib/order-labels'
import { OrderStatusBadge, PaymentStatusBadge } from '../components/orders/status-badge'
import { ShoppingCart } from 'lucide-react'
import { Button } from '../components/catalyst/button'
import { Heading, Subheading } from '../components/catalyst/heading'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/catalyst/table'
import { DeleteConfirmDialog } from '../components/ui/delete-confirm-dialog'
import { EmptyState } from '../components/ui/empty-state'
import { InfoItem } from '../components/ui/info-item'
import { Loading } from '../components/ui/loading'

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { order, loading, error, refetch, transition, transitioning } = useOrderDetail(
    id ?? '',
  )
  const [pendingTransition, setPendingTransition] =
    useState<AdminOrderTransition | null>(null)

  if (loading && !order) {
    return <Loading label="در حال بارگذاری سفارش…" />
  }

  if (error && !order) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="glass flex flex-col items-center gap-4 rounded-xl px-6 py-16 text-center">
          <p className="text-sm/6 text-muted">{translateApiError(error)}</p>
          <Button color="primary" onClick={() => void refetch()}>
            تلاش مجدد
          </Button>
          <Link to="/orders" className="text-sm font-medium text-primary hover:underline">
            بازگشت به فهرست سفارش‌ها
          </Link>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <EmptyState
          title="سفارش یافت نشد"
          description="این سفارش در دسترس نیست."
          icon={<ShoppingCart className="size-6" aria-hidden="true" />}
          actions={
            <Link to="/orders">
              <Button outline>بازگشت به فهرست</Button>
            </Link>
          }
        />
      </div>
    )
  }

  const nextMoves = ORDER_NEXT_TRANSITIONS[order.status]

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Link to="/orders" className="text-sm font-medium text-primary hover:underline">
            بازگشت به فهرست سفارش‌ها
          </Link>
          <div className="flex items-center gap-3">
            <Heading level={1} dir="ltr">
              #{order.orderNumber}
            </Heading>
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.paymentStatus} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {nextMoves.map((next) =>
            next === 'CANCELLED' ? (
              <Button key={next} outline onClick={() => setPendingTransition(next)}>
                {ORDER_TRANSITION_LABELS[next]}
              </Button>
            ) : (
              <Button
                key={next}
                color="primary"
                disabled={transitioning}
                onClick={() => setPendingTransition(next)}
              >
                {ORDER_TRANSITION_LABELS[next]}
              </Button>
            ),
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
          <Subheading>خلاصه سفارش</Subheading>
          <dl className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <InfoItem label="وضعیت" value={ORDER_STATUS_FA[order.status]} />
            <InfoItem label="روش پرداخت" value={PAYMENT_METHOD_FA[order.paymentMethod]} />
            <InfoItem label="جمع اقلام" value={formatRial(order.subtotal)} />
            <InfoItem label="هزینه ارسال" value={formatRial(order.shippingFee)} />
            <InfoItem label="مبلغ نهایی" value={formatRial(order.total)} />
            <InfoItem label="تاریخ ثبت" value={formatDateTime(order.createdAt)} />
          </dl>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
          <Subheading>مشتری و نشانی تحویل</Subheading>
          <dl className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <InfoItem label="موبایل مشتری" value={order.customerMobile} />
            <InfoItem label="تلفن گیرنده" value={order.addressSnapshot.phone} />
            <InfoItem label="نام گیرنده" value={order.addressSnapshot.fullName} />
            <InfoItem
              label="استان / شهر"
              value={
                [order.addressSnapshot.province, order.addressSnapshot.city]
                  .filter(Boolean)
                  .join('، ') || '—'
              }
            />
            <div className="sm:col-span-2">
              <InfoItem label="نشانی" value={order.addressSnapshot.address} />
            </div>
            <InfoItem label="کد پستی" value={order.addressSnapshot.postalCode} />
          </dl>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <Subheading>اقلام سفارش</Subheading>
        <div className="mt-4">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>محصول</TableHeader>
                <TableHeader>کد فنی</TableHeader>
                <TableHeader>تعداد</TableHeader>
                <TableHeader>قیمت واحد</TableHeader>
                <TableHeader>جمع ردیف</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {order.items.map((item) => (
                <TableRow key={item.variantId}>
                  <TableCell className="font-medium text-foreground">
                    {item.productName}
                    {item.variantName && (
                      <span className="block text-xs font-normal text-muted">
                        {item.variantName}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted" dir="ltr">
                    {item.sku}
                  </TableCell>
                  <TableCell className="text-muted" dir="ltr">
                    {item.quantity}
                  </TableCell>
                  <TableCell className="text-muted" dir="ltr">
                    {formatRial(item.unitPrice)}
                  </TableCell>
                  <TableCell className="text-muted" dir="ltr">
                    {formatRial(item.lineTotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <DeleteConfirmDialog
        open={pendingTransition !== null}
        title={
          pendingTransition
            ? `${ORDER_TRANSITION_LABELS[pendingTransition]} — سفارش #${order.orderNumber}`
            : ''
        }
        description={pendingTransition ? ORDER_TRANSITION_DESCRIPTIONS[pendingTransition] : ''}
        confirmLabel={pendingTransition ? ORDER_TRANSITION_LABELS[pendingTransition] : ''}
        pendingLabel="در حال ثبت…"
        onClose={() => setPendingTransition(null)}
        onConfirm={() =>
          pendingTransition ? transition(pendingTransition) : Promise.resolve()
        }
      />
    </div>
  )
}
