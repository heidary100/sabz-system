import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useReviewList } from '../hooks/use-review-list'
import type { ReviewStatusFilter } from '../hooks/use-review-list'
import { translateApiError } from '../lib/error-messages'
import { formatDateTime } from '../lib/format'
import { REVIEW_STATUS_LABELS, REVIEW_STATUS_ORDER } from '../lib/review-labels'
import { ReviewStatusBadge } from '../components/reviews/review-status-badge'
import { Star } from 'lucide-react'
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
import { DeleteConfirmDialog } from '../components/ui/delete-confirm-dialog'
import { EmptyState } from '../components/ui/empty-state'
import { Loading } from '../components/ui/loading'
import { ErrorState } from '../components/ui/error-state'
import { InlineError } from '../components/ui/inline-error'
import { TablePagination } from '../components/ui/table-pagination'
import { PageHeader } from '../components/ui/page-header'
import { TableCard } from '../components/ui/table-card'

export function ReviewsPage() {
  const {
    status,
    page,
    limit,
    result,
    loading,
    error,
    mutatingId,
    actionError,
    setStatus,
    setPage,
    setLimit,
    refetch,
    approve,
    reject,
  } = useReviewList()
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null)

  const totalPages = result ? Math.max(1, Math.ceil(result.total / limit)) : 1

  return (
    <div className="w-full space-y-6">
      <PageHeader title="نقدها" />

      <div className="flex w-full max-w-xs items-end gap-4">
        <Field className="w-full">
          <Label>وضعیت</Label>
          <Select
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ReviewStatusFilter)}
          >
            <option value="">همه وضعیت‌ها</option>
            {REVIEW_STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {REVIEW_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {actionError && (
        <InlineError message={actionError} />
      )}

      {loading && !result ? (
        <Loading compact label="در حال بارگذاری…" />
      ) : error ? (
        <ErrorState message={translateApiError(error)} onRetry={() => void refetch()} />
      ) : !result || result.items.length === 0 ? (
        <EmptyState
          title="دیدگاهی یافت نشد"
          description={
            status === 'PENDING'
              ? 'دیدگاه تازه‌ای در انتظار بررسی نیست.'
              : 'در این وضعیت، دیدگاهی ثبت نشده است.'
          }
          icon={<Star className="size-6" aria-hidden="true" />}
          actions={
            status !== 'PENDING' ? (
              <Button outline onClick={() => setStatus('PENDING')}>
                مشاهده صف بررسی
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
            totalLabel="نقد"
          />
          <Table dense>
            <TableHead>
              <TableRow>
                <TableHeader>محصول</TableHeader>
                <TableHeader>امتیاز</TableHeader>
                <TableHeader>دیدگاه</TableHeader>
                <TableHeader>وضعیت</TableHeader>
                <TableHeader>تاریخ ثبت</TableHeader>
                <TableHeader>
                  <span className="sr-only">عملیات</span>
                </TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.items.map((review) => (
                <TableRow key={review.id}>
                  <TableCell className="font-medium text-foreground">
                    <Link
                      to={`/products/${review.productId}`}
                      className="underline decoration-border underline-offset-4 hover:text-primary"
                    >
                      {review.productName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted" dir="ltr">
                    {review.rating} / ۵
                  </TableCell>
                  <TableCell className="max-w-md text-muted">
                    <span className="block break-words whitespace-pre-wrap">
                      {review.comment ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ReviewStatusBadge status={review.status} />
                  </TableCell>
                  <TableCell className="text-muted">{formatDateTime(review.createdAt)}</TableCell>
                  <TableCell>
                    {review.status === 'PENDING' ? (
                      <div className="flex items-center gap-2">
                        <Button
                          color="green"
                          disabled={mutatingId !== null}
                          onClick={() => void approve(review.id)}
                        >
                          {mutatingId === review.id ? 'در حال ثبت…' : 'تأیید'}
                        </Button>
                        <Button
                          outline
                          disabled={mutatingId !== null}
                          onClick={() => setRejectTargetId(review.id)}
                        >
                          رد
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted">بررسی شد</span>
                    )}
                  </TableCell>
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
            limit={limit}
            limitOptions={[20, 50]}
            onLimitChange={setLimit}
            disabled={loading}
            totalLabel="نقد"
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

      <DeleteConfirmDialog
        open={rejectTargetId !== null}
        title="رد دیدگاه"
        description="این دیدگاه رد می‌شود و دیگر هرگز نمایش داده نخواهد شد. این عمل قابل بازگشت نیست."
        confirmLabel="رد دیدگاه"
        pendingLabel="در حال رد…"
        onClose={() => setRejectTargetId(null)}
        onConfirm={async () => {
          if (rejectTargetId) {
            await reject(rejectTargetId)
          }
        }}
      />
    </div>
  )
}
