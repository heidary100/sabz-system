import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { AdminOrderTransition, ShipmentStatus } from '@sabz/types'
import { useOrderDetail } from '../hooks/use-order-detail'
import { translateApiError } from '../lib/error-messages'
import { formatDateTime, formatRial } from '../lib/format'
import {
  ORDER_NEXT_TRANSITIONS,
  ORDER_PAYMENT_METHOD_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_TRANSITION_DESCRIPTIONS,
  ORDER_TRANSITION_LABELS,
} from '../lib/order-labels'
import {
  SHIPMENT_NEXT_TRANSITIONS,
  SHIPMENT_STATUS_LABELS,
  SHIPPING_METHOD_LABELS,
} from '../lib/shipping-labels'
import { OrderStatusBadge, PaymentStatusBadge } from '../components/orders/status-badge'
import { ShipmentStatusBadge } from '../components/orders/shipment-badge'
import { ShoppingCart } from 'lucide-react'
import { Button } from '../components/catalyst/button'
import { ErrorMessage, Field, Label } from '../components/catalyst/fieldset'
import { RouteHelpSection } from '../components/ui/page-help'
import { Heading, Subheading } from '../components/catalyst/heading'
import { Input } from '../components/catalyst/input'
import { Select } from '../components/catalyst/select'
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
import { ErrorState } from '../components/ui/error-state'
import { InlineError } from '../components/ui/inline-error'

function ShipmentForm({
  trackingNumber,
  status,
  mutating,
  onSave,
}: {
  trackingNumber: string | null
  status: ShipmentStatus
  mutating: boolean
  onSave: (input: { trackingNumber?: string; status?: ShipmentStatus }) => Promise<void>
}) {
  const [tracking, setTracking] = useState(trackingNumber ?? '')
  const [next, setNext] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const moves = SHIPMENT_NEXT_TRANSITIONS[status]

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setSubmitError(null)
    const trimmed = tracking.trim()
    const changedTracking = trimmed !== (trackingNumber ?? '')
    if (!changedTracking && !next) {
      return
    }
    try {
      await onSave({
        ...(changedTracking ? { trackingNumber: trimmed } : {}),
        ...(next ? { status: next as ShipmentStatus } : {}),
      })
      setNext('')
    } catch (error) {
      setSubmitError(translateApiError(error))
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <Label>کد رهگیری باربری</Label>
          <Input
            name="trackingNumber"
            dir="ltr"
            placeholder="مثلاً TIPAX-12345"
            value={tracking}
            disabled={mutating}
            onChange={(event) => setTracking(event.target.value)}
          />
        </Field>
        <Field>
          <Label>تغییر وضعیت ارسال</Label>
          <Select
            name="shipmentStatus"
            value={next}
            disabled={mutating || moves.length === 0}
            onChange={(event) => setNext(event.target.value)}
          >
            <option value="">بدون تغییر</option>
            {moves.map((move) => (
              <option key={move} value={move}>
                {SHIPMENT_STATUS_LABELS[move]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {submitError && (
        <InlineError message={submitError} />
      )}
      <div>
        <Button type="submit" color="primary" disabled={mutating}>
          {mutating ? 'در حال ثبت…' : 'ثبت ارسال'}
        </Button>
      </div>
    </form>
  )
}

function TrackingEventForm({
  status,
  mutating,
  onAdd,
}: {
  status: ShipmentStatus
  mutating: boolean
  onAdd: (input: {
    status: ShipmentStatus
    location?: string
    note?: string
  }) => Promise<void>
}) {
  const moves = SHIPMENT_NEXT_TRANSITIONS[status]
  const [next, setNext] = useState(moves[0] ?? '')
  const [location, setLocation] = useState('')
  const [note, setNote] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  if (moves.length === 0) {
    return null
  }

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (!next) {
      setFieldError('وضعیت رهگیری را انتخاب کنید.')
      return
    }
    setFieldError(null)
    setSubmitError(null)
    try {
      await onAdd({
        status: next as ShipmentStatus,
        ...(location.trim() ? { location: location.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      })
      setLocation('')
      setNote('')
      setNext(SHIPMENT_NEXT_TRANSITIONS[next as ShipmentStatus]?.[0] ?? '')
    } catch (error) {
      setSubmitError(translateApiError(error))
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field>
          <Label>وضعیت جدید</Label>
          <Select
            name="eventStatus"
            value={next}
            disabled={mutating}
            onChange={(event) => setNext(event.target.value)}
          >
            {moves.map((move) => (
              <option key={move} value={move}>
                {SHIPMENT_STATUS_LABELS[move]}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>موقعیت (اختیاری)</Label>
          <Input
            name="location"
            placeholder="مثلاً تهران — مرکز تجزیه مبادلات"
            value={location}
            disabled={mutating}
            onChange={(event) => setLocation(event.target.value)}
          />
        </Field>
        <Field>
          <Label>یادداشت (اختیاری)</Label>
          <Input
            name="note"
            placeholder="مثلاً مرسوله تحویل باربری شد."
            value={note}
            disabled={mutating}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </div>
      {fieldError && <ErrorMessage>{fieldError}</ErrorMessage>}
      {submitError && (
        <InlineError message={submitError} />
      )}
      <div>
        <Button type="submit" outline disabled={mutating}>
          {mutating ? 'در حال ثبت…' : 'ثبت رویداد رهگیری'}
        </Button>
      </div>
    </form>
  )
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const {
    order,
    loading,
    error,
    refetch,
    transition,
    transitioning,
    saveShipment,
    appendTrackingEvent,
    mutating,
  } = useOrderDetail(id ?? '')
  const [pendingTransition, setPendingTransition] =
    useState<AdminOrderTransition | null>(null)

  if (loading && !order) {
    return <Loading label="در حال بارگذاری سفارش…" />
  }

  if (error && !order) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <ErrorState message={translateApiError(error)} onRetry={() => void refetch()}>
          <Link to="/orders" className="text-sm font-medium text-primary hover:underline">
            بازگشت به فهرست سفارش‌ها
          </Link>
        </ErrorState>
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
            <RouteHelpSection className="ms-auto" />
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
            <InfoItem label="وضعیت" value={ORDER_STATUS_LABELS[order.status]} />
            <InfoItem label="روش پرداخت" value={ORDER_PAYMENT_METHOD_LABELS[order.paymentMethod]} />
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Subheading>ارسال و رهگیری</Subheading>
          {order.shipment && <ShipmentStatusBadge status={order.shipment.status} />}
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <InfoItem label="شیوه ارسال" value={SHIPPING_METHOD_LABELS[order.shippingMethod]} />
          <InfoItem
            label="کد رهگیری"
            value={order.shipment?.trackingNumber ?? '—'}
          />
          <InfoItem
            label="زمان تحویل به باربری"
            value={formatDateTime(order.shipment?.shippedAt)}
          />
          <InfoItem
            label="زمان تحویل به گیرنده"
            value={formatDateTime(order.shipment?.deliveredAt)}
          />
        </dl>
        {order.shipment && order.shipment.events.length > 0 && (
          <ol aria-label="رویدادهای رهگیری" className="mt-4 space-y-2 text-sm">
            {order.shipment.events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium text-foreground">
                  {SHIPMENT_STATUS_LABELS[event.status]}
                </span>
                {event.location && <span className="text-muted">{event.location}</span>}
                {event.note && <span className="text-muted">— {event.note}</span>}
                <span className="text-xs text-muted">{formatDateTime(event.createdAt)}</span>
              </li>
            ))}
          </ol>
        )}
        {order.shipment && (
          <>
            <ShipmentForm
              trackingNumber={order.shipment.trackingNumber}
              status={order.shipment.status}
              mutating={mutating}
              onSave={saveShipment}
            />
            <TrackingEventForm
              status={order.shipment.status}
              mutating={mutating}
              onAdd={appendTrackingEvent}
            />
          </>
        )}
      </section>

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
