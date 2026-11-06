import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useReturnList } from '../hooks/use-return-list'
import type { ReturnStatusFilter } from '../hooks/use-return-list'
import { translateApiError } from '../lib/error-messages'
import { formatDateTime } from '../lib/format'
import { pageNumbers } from '../lib/pagination'
import { RETURN_STATUS_LABELS, RETURN_STATUS_ORDER } from '../lib/return-labels'
import { ReturnStatusBadge } from '../components/returns/return-status-badge'
import { RejectReturnDialog } from '../components/returns/reject-return-dialog'
import { Undo2 } from 'lucide-react'
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
import { PageHeader } from '../components/ui/page-header'
import { TableCard } from '../components/ui/table-card'
import {
  Pagination,
  PaginationGap,
  PaginationList,
  PaginationNext,
  PaginationPage,
  PaginationPrevious,
} from '../components/ui/pagination'

export function ReturnsPage() {
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
    refetch,
    approve,
    receive,
    complete,
    reject,
  } = useReturnList()
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null)

  const totalPages = result ? Math.max(1, Math.ceil(result.total / limit)) : 1

  return (
    <div className="w-full space-y-6">
      <PageHeader title="مرجوعی‌ها" />

      <div className="flex w-full max-w-xs items-end gap-4">
        <Field className="w-full">
          <Label>وضعیت</Label>
          <Select
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ReturnStatusFilter)}
          >
            <option value="">همه وضعیت‌ها</option>
            {RETURN_STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {RETURN_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {actionError && (
        <p className="danger-box rounded-lg px-3 py-2 text-sm" role="alert">
          {actionError}
        </p>
      )}

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
          title="درخواست مرجوعی یافت نشد"
          description={
            status === 'PENDING'
              ? 'درخواست تازه‌ای در انتظار بررسی نیست.'
              : 'در این وضعیت، درخواستی ثبت نشده است.'
          }
          icon={<Undo2 className="size-6" aria-hidden="true" />}
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
          <Table striped dense>
            <TableHead>
              <TableRow>
                <TableHeader>سفارش</TableHeader>
                <TableHeader>مشتری</TableHeader>
                <TableHeader>اقلام</TableHeader>
                <TableHeader>دلیل</TableHeader>
                <TableHeader>وضعیت</TableHeader>
                <TableHeader>تاریخ ثبت</TableHeader>
                <TableHeader>
                  <span className="sr-only">عملیات</span>
                </TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-foreground" dir="ltr">
                    <Link
                      to={`/returns/${item.id}`}
                      className="underline decoration-border underline-offset-4 hover:text-primary"
                    >
                      #{item.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted" dir="ltr">
                    {item.customerMobile}
                  </TableCell>
                  <TableCell className="text-muted">
                    {item.items.length} قلم
                  </TableCell>
                  <TableCell className="max-w-xs text-muted">
                    <span className="block truncate">{item.reason}</span>
                  </TableCell>
                  <TableCell>
                    <ReturnStatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="text-muted">{formatDateTime(item.createdAt)}</TableCell>
                  <TableCell>
                    {item.status === 'PENDING' ? (
                      <div className="flex items-center gap-2">
                        <Button
                          color="green"
                          disabled={mutatingId !== null}
                          onClick={() => void approve(item.id)}
                        >
                          {mutatingId === item.id ? 'در حال ثبت…' : 'تأیید'}
                        </Button>
                        <Button
                          outline
                          disabled={mutatingId !== null}
                          onClick={() => setRejectTargetId(item.id)}
                        >
                          رد
                        </Button>
                      </div>
                    ) : item.status === 'APPROVED' ? (
                      <Button
                        color="primary"
                        disabled={mutatingId !== null}
                        onClick={() => void receive(item.id)}
                      >
                        {mutatingId === item.id ? 'در حال ثبت…' : 'ثبت دریافت'}
                      </Button>
                    ) : item.status === 'RECEIVED' ? (
                      <Button
                        color="green"
                        disabled={mutatingId !== null}
                        onClick={() => void complete(item.id)}
                      >
                        {mutatingId === item.id ? 'در حال ثبت…' : 'تکمیل'}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted">بسته شد</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 border-t border-border pt-4">
            <Pagination aria-label="صفحه‌بندی مرجوعی‌ها">
              <PaginationPrevious
                disabled={page <= 1 || loading}
                onClick={() => setPage(page - 1)}
              />
              <PaginationList>
                {pageNumbers(page, totalPages).map((item, index) =>
                  item === 'gap' ? (
                    <PaginationGap key={`gap-${index}`} />
                  ) : (
                    <PaginationPage
                      key={item}
                      current={item === page}
                      disabled={loading}
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </PaginationPage>
                  ),
                )}
              </PaginationList>
              <PaginationNext
                disabled={page >= totalPages || loading}
                onClick={() => setPage(page + 1)}
              />
            </Pagination>
          </div>
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
        {result ? `مجموع: ${result.total} درخواست · ${limit} مورد در هر صفحه` : ''}
      </p>

      <RejectReturnDialog
        open={rejectTargetId !== null}
        title="رد درخواست مرجوعی"
        onClose={() => setRejectTargetId(null)}
        onConfirm={async (reason) => {
          if (rejectTargetId) {
            await reject(rejectTargetId, reason)
          }
        }}
      />
    </div>
  )
}
