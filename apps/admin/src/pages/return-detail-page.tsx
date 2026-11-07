import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useReturnDetail } from '../hooks/use-return-detail'
import { translateApiError } from '../lib/error-messages'
import { formatDateTime } from '../lib/format'
import { RETURN_STATUS_LABELS } from '../lib/return-labels'
import { ReturnStatusBadge } from '../components/returns/return-status-badge'
import { RejectReturnDialog } from '../components/returns/reject-return-dialog'
import { Undo2 } from 'lucide-react'
import { Button } from '../components/catalyst/button'
import { RouteHelpSection } from '../components/ui/page-help'
import { Heading, Subheading } from '../components/catalyst/heading'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/catalyst/table'
import { EmptyState } from '../components/ui/empty-state'
import { InfoItem } from '../components/ui/info-item'
import { Loading } from '../components/ui/loading'
import { ErrorState } from '../components/ui/error-state'
import { InlineError } from '../components/ui/inline-error'
import { TableCard } from '../components/ui/table-card'

export function ReturnDetailPage() {
  const { id } = useParams<{ id: string }>()
  const {
    detail,
    loading,
    error,
    refetch,
    approve,
    reject,
    receive,
    complete,
    mutating,
  } = useReturnDetail(id ?? '')
  const [rejectOpen, setRejectOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  if (loading && !detail) {
    return <Loading label="در حال بارگذاری درخواست…" />
  }

  if (error && !detail) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <ErrorState message={translateApiError(error)} onRetry={() => void refetch()}>
          <Link to="/returns" className="text-sm font-medium text-primary hover:underline">
            بازگشت به فهرست مرجوعی‌ها
          </Link>
        </ErrorState>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <EmptyState
          title="درخواست یافت نشد"
          description="این درخواست مرجوعی در دسترس نیست."
          icon={<Undo2 className="size-6" aria-hidden="true" />}
          actions={
            <Link to="/returns">
              <Button outline>بازگشت به فهرست</Button>
            </Link>
          }
        />
      </div>
    )
  }

  const runAction = async (action: () => Promise<void>): Promise<void> => {
    setActionError(null)
    try {
      await action()
    } catch (error) {
      setActionError(translateApiError(error))
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Link to="/returns" className="text-sm font-medium text-primary hover:underline">
            بازگشت به فهرست مرجوعی‌ها
          </Link>
          <div className="flex items-center gap-3">
            <Heading level={1} dir="ltr">
              #{detail.orderNumber}
            </Heading>
            <RouteHelpSection className="ms-auto" />
            <ReturnStatusBadge status={detail.status} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {detail.status === 'PENDING' && (
            <>
              <Button
                color="green"
                disabled={mutating}
                onClick={() => void runAction(() => approve())}
              >
                {mutating ? 'در حال ثبت…' : 'تأیید درخواست'}
              </Button>
              <Button outline disabled={mutating} onClick={() => setRejectOpen(true)}>
                رد درخواست
              </Button>
            </>
          )}
          {detail.status === 'APPROVED' && (
            <Button
              color="primary"
              disabled={mutating}
              onClick={() => void runAction(() => receive())}
            >
              {mutating ? 'در حال ثبت…' : 'ثبت دریافت کالا'}
            </Button>
          )}
          {detail.status === 'RECEIVED' && (
            <Button
              color="green"
              disabled={mutating}
              onClick={() => void runAction(() => complete())}
            >
              {mutating ? 'در حال ثبت…' : 'تکمیل پس از بازبینی'}
            </Button>
          )}
        </div>
      </div>

      {actionError && (
        <InlineError message={actionError} />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
          <Subheading>خلاصه درخواست</Subheading>
          <dl className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <InfoItem label="وضعیت" value={RETURN_STATUS_LABELS[detail.status]} />
            <InfoItem label="موبایل مشتری" value={detail.customerMobile} />
            <InfoItem label="تاریخ ثبت" value={formatDateTime(detail.createdAt)} />
            <InfoItem
              label="تاریخ دریافت"
              value={detail.receivedAt ? formatDateTime(detail.receivedAt) : null}
            />
            <InfoItem
              label="تاریخ تکمیل"
              value={detail.completedAt ? formatDateTime(detail.completedAt) : null}
            />
            <InfoItem
              label="تاریخ لغو"
              value={detail.cancelledAt ? formatDateTime(detail.cancelledAt) : null}
            />
          </dl>
          <dl className="mt-5 space-y-5">
            <InfoItem label="دلیل مرجوعی" value={detail.reason} />
            {detail.rejectReason && (
              <InfoItem label="دلیل رد" value={detail.rejectReason} />
            )}
          </dl>
          <div className="mt-5">
            <dt className="text-sm font-medium text-muted">سفارش</dt>
            <dd className="mt-1 text-sm">
              <Link
                to={`/orders/${detail.orderId}`}
                className="font-medium text-primary hover:underline"
              >
                مشاهده سفارش #{detail.orderNumber}
              </Link>
            </dd>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
          <Subheading>اقلام مرجوعی</Subheading>
          <div className="mt-4">
            <TableCard>
              <Table striped>
                <TableHead>
                  <TableRow>
                    <TableHeader>کالا</TableHeader>
                    <TableHeader>کد فنی</TableHeader>
                    <TableHeader>تعداد</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail.items.map((item) => (
                    <TableRow key={item.id}>
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
                      <TableCell className="text-muted">{item.quantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          </div>
        </section>
      </div>

      <RejectReturnDialog
        open={rejectOpen}
        title={`رد درخواست مرجوعی — #${detail.orderNumber}`}
        onClose={() => setRejectOpen(false)}
        onConfirm={(reason) => reject(reason)}
      />
    </div>
  )
}
