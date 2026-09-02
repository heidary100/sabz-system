import { useNavigate } from 'react-router-dom'
import { usePartnerList } from '../hooks/use-partner-list'
import { translateApiError } from '../lib/error-messages'
import { formatDate } from '../lib/format'
import { pageNumbers } from '../lib/pagination'
import { PARTNER_STATUS_LABELS, PARTNER_STATUS_ORDER } from '../lib/partner-labels'
import type { PartnerStatus } from '@sabz/types'
import { Briefcase } from 'lucide-react'
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
import { StatusBadge } from '../components/partners/status-badge'

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
      <PageHeader title="درخواست‌های همکاری" />

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
        <div className="glass flex flex-col items-center gap-4 rounded-xl px-6 py-16 text-center">
          <p className="text-sm/6 text-muted">{translateApiError(error)}</p>
          <Button color="primary" onClick={() => void refetch()}>
            تلاش مجدد
          </Button>
        </div>
      ) : !result || result.items.length === 0 ? (
        <EmptyState
          title="درخواستی یافت نشد"
          description="در این وضعیت، درخواست همکاری ثبت نشده است."
          icon={<Briefcase className="size-6" aria-hidden="true" />}
          actions={
            status !== 'PENDING' ? (
              <Button outline onClick={() => setStatus('PENDING')}>
                مشاهده در انتظار بررسی
              </Button>
            ) : undefined
          }
        />
      ) : (
        <TableCard>
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
                  <TableCell className="font-medium text-foreground">
                    {partner.businessName}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={partner.approvalStatus} />
                  </TableCell>
                  <TableCell className="text-muted">
                    {[partner.province, partner.city].filter(Boolean).join('، ') || '—'}
                  </TableCell>
                  <TableCell className="text-muted">
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
    </div>
  )
}