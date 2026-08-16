import { useNavigate } from 'react-router-dom'
import { usePartnerList } from '../hooks/use-partner-list'
import { translateApiError } from '../lib/error-messages'
import { formatDate } from '../lib/format'
import { PARTNER_STATUS_LABELS, PARTNER_STATUS_ORDER } from '../lib/partner-labels'
import type { PartnerStatus } from '@sabz/types'
import { Button } from '../components/catalyst/button'
import { Field, Label } from '../components/catalyst/fieldset'
import { Heading } from '../components/catalyst/heading'
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
import {
  Pagination,
  PaginationGap,
  PaginationList,
  PaginationNext,
  PaginationPage,
  PaginationPrevious,
} from '../components/ui/pagination'
import { StatusBadge } from '../components/partners/status-badge'

function pageNumbers(current: number, totalPages: number): (number | 'gap')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const pages: (number | 'gap')[] = [1]
  if (current > 3) {
    pages.push('gap')
  }
  for (let page = Math.max(2, current - 1); page <= Math.min(totalPages - 1, current + 1); page++) {
    pages.push(page)
  }
  if (current < totalPages - 2) {
    pages.push('gap')
  }
  pages.push(totalPages)
  return pages
}

export function PartnersPage() {
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
  } = usePartnerList()

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1

  const openPartner = (partnerId: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    navigate(`/partners/${partnerId}`)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <Heading level={1}>درخواست‌های همکاری</Heading>
      </div>

      <div className="flex w-full max-w-xs items-end gap-4">
        <Field className="w-full">
          <Label>وضعیت</Label>
          <Select
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as PartnerStatus)}
          >
            {PARTNER_STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {PARTNER_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {loading && !result ? (
        <Loading compact label="در حال بارگذاری…" />
      ) : error ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-white px-6 py-16 text-center">
          <p className="text-sm/6 text-dust-200">{translateApiError(error)}</p>
          <Button color="primary" onClick={() => void refetch()}>
            تلاش مجدد
          </Button>
        </div>
      ) : !result || result.items.length === 0 ? (
        <EmptyState
          title="درخواستی یافت نشد"
          description="در این وضعیت، درخواست همکاری ثبت نشده است."
          actions={
            status !== 'PENDING' ? (
              <Button outline onClick={() => setStatus('PENDING')}>
                مشاهده در انتظار بررسی
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border border-border bg-white p-4">
          <Table striped>
            <TableHead>
              <TableRow>
                <TableHeader>نام کسب‌وکار</TableHeader>
                <TableHeader>وضعیت</TableHeader>
                <TableHeader>موقعیت</TableHeader>
                <TableHeader>تاریخ ثبت</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.items.map((partner) => (
                <TableRow
                  key={partner.id}
                  href={`/partners/${partner.id}`}
                  title={`مشاهده ${partner.businessName}`}
                  onNavigate={openPartner(partner.id)}
                >
                  <TableCell className="font-medium text-zinc-950">
                    {partner.businessName}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={partner.approvalStatus} />
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {[partner.province, partner.city].filter(Boolean).join('، ') || '—'}
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {formatDate(partner.submittedAt ?? partner.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 border-t border-border pt-4">
            <Pagination aria-label="صفحه‌بندی درخواست‌ها">
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
        </div>
      )}

      {loading && result && (
        <div className="flex items-center justify-center gap-3 py-4" role="status">
          <span
            aria-hidden="true"
            className="size-5 animate-spin rounded-full border-2 border-hunter-800 border-t-primary"
          />
          <span className="text-sm font-medium text-dust-200">در حال بارگذاری…</span>
        </div>
      )}

      <p className="text-xs text-dust-200">
        {result ? `مجموع: ${result.total} درخواست · ${limit} مورد در هر صفحه` : ''}
      </p>
    </div>
  )
}