import { useNavigate } from 'react-router-dom'
import { useRfqList } from '../hooks/use-rfq-list'
import type { RfqStatusFilter } from '../hooks/use-rfq-list'
import { translateApiError } from '../lib/error-messages'
import { formatDateTime, formatRial } from '../lib/format'
import { pageNumbers } from '../lib/pagination'
import { RFQ_STATUS_LABELS, RFQ_STATUS_ORDER } from '../lib/rfq-labels'
import { RfqStatusBadge } from '../components/rfq/rfq-status-badge'
import { FileText } from 'lucide-react'
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

export function RfqPage() {
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
  } = useRfqList()

  const totalPages = result ? Math.max(1, Math.ceil(result.total / limit)) : 1

  const openRfq = (rfqId: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    navigate(`/rfq/${rfqId}`)
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader title="استعلام‌ها" />

      <div className="flex w-full max-w-xs items-end gap-4">
        <Field className="w-full">
          <Label>وضعیت</Label>
          <Select
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as RfqStatusFilter)}
          >
            <option value="">همه وضعیت‌ها</option>
            {RFQ_STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {RFQ_STATUS_LABELS[value]}
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
          title="استعلامی یافت نشد"
          description="در این وضعیت، استعلام قیمتی ثبت نشده است."
          icon={<FileText className="size-6" aria-hidden="true" />}
          actions={
            status !== '' ? (
              <Button outline onClick={() => setStatus('')}>
                مشاهده همه استعلام‌ها
              </Button>
            ) : undefined
          }
        />
      ) : (
        <TableCard>
          <Table striped dense>
            <TableHead>
              <TableRow>
                <TableHeader>محصول</TableHeader>
                <TableHeader>کد فنی</TableHeader>
                <TableHeader>تعداد</TableHeader>
                <TableHeader>وضعیت</TableHeader>
                <TableHeader>قیمت اعلام‌شده</TableHeader>
                <TableHeader>انقضا</TableHeader>
                <TableHeader>تاریخ ثبت</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.items.map((rfq) => (
                <TableRow
                  key={rfq.id}
                  href={`/rfq/${rfq.id}`}
                  title={`مشاهده استعلام ${rfq.productName}`}
                  onNavigate={openRfq(rfq.id)}
                >
                  <TableCell className="font-medium text-foreground">
                    {rfq.productName}
                  </TableCell>
                  <TableCell className="text-muted" dir="ltr">
                    {rfq.variantSku}
                  </TableCell>
                  <TableCell className="text-muted" dir="ltr">
                    {rfq.quantity}
                  </TableCell>
                  <TableCell>
                    <RfqStatusBadge status={rfq.status} />
                  </TableCell>
                  <TableCell className="text-muted" dir="ltr">
                    {formatRial(rfq.quotedUnitPrice)}
                  </TableCell>
                  <TableCell className="text-muted">{formatDateTime(rfq.expiresAt)}</TableCell>
                  <TableCell className="text-muted">{formatDateTime(rfq.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 border-t border-border pt-4">
            <Pagination aria-label="صفحه‌بندی استعلام‌ها">
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
        {result ? `مجموع: ${result.total} استعلام · ${limit} مورد در هر صفحه` : ''}
      </p>
    </div>
  )
}
