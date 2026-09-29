import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useRfqDetail } from '../hooks/use-rfq-detail'
import { translateApiError } from '../lib/error-messages'
import { formatDateTime, formatRial } from '../lib/format'
import { RFQ_STATUS_LABELS } from '../lib/rfq-labels'
import { RfqStatusBadge } from '../components/rfq/rfq-status-badge'
import { FileText } from 'lucide-react'
import { Button } from '../components/catalyst/button'
import { ErrorMessage, Field, Label } from '../components/catalyst/fieldset'
import { Heading, Subheading } from '../components/catalyst/heading'
import { Input } from '../components/catalyst/input'
import { DeleteConfirmDialog } from '../components/ui/delete-confirm-dialog'
import { EmptyState } from '../components/ui/empty-state'
import { InfoItem } from '../components/ui/info-item'
import { Loading } from '../components/ui/loading'

const UNIT_PRICE_PATTERN = /^\d+(\.\d{1,2})?$/

function validateUnitPrice(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    return 'قیمت واحد الزامی است.'
  }
  if (!UNIT_PRICE_PATTERN.test(trimmed)) {
    return 'قیمت واحد باید عددی مثبت با حداکثر ۲ رقم اعشار باشد.'
  }
  if (Number(trimmed) <= 0) {
    return 'قیمت واحد باید بزرگ‌تر از صفر باشد.'
  }
  return null
}

function validateExpiry(raw: string): string | null {
  if (!raw) {
    return null
  }
  const time = new Date(raw).getTime()
  if (Number.isNaN(time)) {
    return 'تاریخ انقضا معتبر نیست.'
  }
  if (time <= Date.now()) {
    return 'تاریخ انقضا باید در آینده باشد.'
  }
  return null
}

function QuoteForm({
  mutating,
  onQuote,
}: {
  mutating: boolean
  onQuote: (input: { unitPrice: string; expiresAt?: string }) => Promise<void>
}) {
  const [unitPrice, setUnitPrice] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    const priceError = validateUnitPrice(unitPrice)
    if (priceError) {
      setFieldError(priceError)
      return
    }
    const expiryError = validateExpiry(expiresAt)
    if (expiryError) {
      setFieldError(expiryError)
      return
    }
    setFieldError(null)
    setSubmitError(null)
    try {
      await onQuote({
        unitPrice: unitPrice.trim(),
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      })
      setUnitPrice('')
      setExpiresAt('')
    } catch (error) {
      setSubmitError(translateApiError(error))
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <Label>قیمت واحد (ریال)</Label>
          <Input
            name="unitPrice"
            inputMode="decimal"
            dir="ltr"
            placeholder="۱۵۰۰۰۰"
            value={unitPrice}
            disabled={mutating}
            onChange={(event) => setUnitPrice(event.target.value)}
          />
        </Field>
        <Field>
          <Label>انقضا (اختیاری — پیش‌فرض ۷ روز)</Label>
          <Input
            name="expiresAt"
            type="datetime-local"
            dir="ltr"
            value={expiresAt}
            disabled={mutating}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </Field>
      </div>
      {fieldError && <ErrorMessage>{fieldError}</ErrorMessage>}
      {submitError && (
        <p className="danger-box rounded-lg px-3 py-2 text-sm">{submitError}</p>
      )}
      <div>
        <Button type="submit" color="primary" disabled={mutating}>
          {mutating ? 'در حال ثبت…' : 'ثبت قیمت'}
        </Button>
      </div>
    </form>
  )
}

export function RfqDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { rfq, loading, error, refetch, quote, reject, mutating } = useRfqDetail(id ?? '')
  const [rejectOpen, setRejectOpen] = useState(false)

  if (loading && !rfq) {
    return <Loading label="در حال بارگذاری استعلام…" />
  }

  if (error && !rfq) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="glass flex flex-col items-center gap-4 rounded-xl px-6 py-16 text-center">
          <p className="text-sm/6 text-muted">{translateApiError(error)}</p>
          <Button color="primary" onClick={() => void refetch()}>
            تلاش مجدد
          </Button>
          <Link to="/rfq" className="text-sm font-medium text-primary hover:underline">
            بازگشت به فهرست استعلام‌ها
          </Link>
        </div>
      </div>
    )
  }

  if (!rfq) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <EmptyState
          title="استعلام یافت نشد"
          description="این استعلام در دسترس نیست."
          icon={<FileText className="size-6" aria-hidden="true" />}
          actions={
            <Link to="/rfq">
              <Button outline>بازگشت به فهرست</Button>
            </Link>
          }
        />
      </div>
    )
  }

  const quotable = rfq.status === 'PENDING'
  const rejectable = rfq.status === 'PENDING' || rfq.status === 'QUOTED'

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Link to="/rfq" className="text-sm font-medium text-primary hover:underline">
            بازگشت به فهرست استعلام‌ها
          </Link>
          <div className="flex items-center gap-3">
            <Heading level={1}>{rfq.productName}</Heading>
            <RfqStatusBadge status={rfq.status} />
          </div>
        </div>

        {rejectable && (
          <div className="flex flex-wrap items-center gap-3">
            <Button outline disabled={mutating} onClick={() => setRejectOpen(true)}>
              رد استعلام
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
          <Subheading>خلاصه استعلام</Subheading>
          <dl className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <InfoItem label="وضعیت" value={RFQ_STATUS_LABELS[rfq.status]} />
            <InfoItem label="تعداد" value={String(rfq.quantity)} />
            <InfoItem label="کد فنی" value={rfq.variantSku} />
            <InfoItem label="شناسه محصول" value={rfq.productSlug} />
            <InfoItem label="تاریخ ثبت" value={formatDateTime(rfq.createdAt)} />
            <InfoItem label="انقضا" value={formatDateTime(rfq.expiresAt)} />
          </dl>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
          <Subheading>قیمت اعلام‌شده</Subheading>
          <dl className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <InfoItem label="قیمت واحد" value={formatRial(rfq.quotedUnitPrice)} />
            <InfoItem label="جمع ردیف" value={formatRial(rfq.quotedLineTotal)} />
            {rfq.orderId && (
              <div className="space-y-1 sm:col-span-2">
                <dt className="text-sm font-medium text-muted">سفارش ساخته‌شده</dt>
                <dd className="text-sm text-foreground">
                  <Link
                    to={`/orders/${rfq.orderId}`}
                    className="font-medium text-primary hover:underline"
                    dir="ltr"
                  >
                    {rfq.orderId}
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      {quotable && (
        <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
          <Subheading>اعلام قیمت</Subheading>
          <p className="mt-2 text-sm text-muted">
            با ثبت قیمت، استعلام وارد وضعیت «قیمت اعلام شد» می‌شود. مبلغ به ریال وارد
            شود.
          </p>
          <QuoteForm mutating={mutating} onQuote={quote} />
        </section>
      )}

      <DeleteConfirmDialog
        open={rejectOpen}
        title={`رد استعلام — ${rfq.productName}`}
        description="این استعلام رد می‌شود و دیگر قابل قیمت‌گذاری نخواهد بود. این عمل قابل بازگشت نیست."
        confirmLabel="رد استعلام"
        pendingLabel="در حال ثبت…"
        onClose={() => setRejectOpen(false)}
        onConfirm={() => reject()}
      />
    </div>
  )
}
