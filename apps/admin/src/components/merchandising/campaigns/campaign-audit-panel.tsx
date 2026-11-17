import { useState } from 'react'
import type { AuditEntry } from '@sabz/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../catalyst/table'
import { Button } from '../../catalyst/button'
import { EmptyState } from '../../ui/empty-state'
import { ErrorState } from '../../ui/error-state'
import { Loading } from '../../ui/loading'
import { TableCard } from '../../ui/table-card'
import { TablePagination } from '../../ui/table-pagination'
import { AuditDetailsDialog } from '../../audit/audit-details-dialog'
import { useMerchCampaignAudit } from '../../../hooks/use-merch-campaign-audit'
import { auditActionLabel } from '../../../lib/audit-labels'
import { translateApiError } from '../../../lib/error-messages'
import { formatDateTime } from '../../../lib/format'

export function CampaignAuditPanel({
  campaignId,
  enabled,
}: {
  campaignId: string | undefined
  enabled: boolean
}) {
  const {
    page,
    limit,
    entries,
    total,
    loading,
    error,
    setPage,
    refetch,
  } = useMerchCampaignAudit(campaignId, enabled)
  const [selected, setSelected] = useState<AuditEntry | null>(null)
  const totalPages = Math.max(1, Math.ceil(total / limit))

  if (!campaignId) {
    return (
      <EmptyState
        size="compact"
        title="گردش فعالیت در دسترس نیست"
        description="ابتدا کمپین را ایجاد کنید."
      />
    )
  }

  if (loading && entries.length === 0) {
    return <Loading compact label="در حال بارگذاری گردش فعالیت…" />
  }

  if (error) {
    return (
      <ErrorState
        size="compact"
        message={translateApiError(error)}
        onRetry={() => void refetch()}
      />
    )
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        size="compact"
        title="فعالیتی برای این کمپین ثبت نشده است"
        description="تغییرات بعدی این کمپین در همین‌جا نمایش داده می‌شوند."
      />
    )
  }

  return (
    <>
      <TableCard>
        <TablePagination
          position="top"
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
          limit={limit}
          disabled={loading}
          totalLabel="رویداد"
        />
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>رویداد</TableHeader>
              <TableHeader>عامل</TableHeader>
              <TableHeader>زمان</TableHeader>
              <TableHeader>جزئیات</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{auditActionLabel(entry.action)}</TableCell>
                <TableCell className="text-muted">
                  {entry.actor
                    ? [entry.actor.firstName, entry.actor.lastName]
                        .filter(Boolean)
                        .join(' ') || entry.actor.mobile
                    : 'سیستم/ناشناس'}
                </TableCell>
                <TableCell className="text-muted">
                  {formatDateTime(entry.createdAt)}
                </TableCell>
                <TableCell>
                  <Button plain onClick={() => setSelected(entry)}>
                    مشاهده
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          position="bottom"
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
          limit={limit}
          disabled={loading}
          totalLabel="رویداد"
        />
      </TableCard>
      <AuditDetailsDialog
        entry={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
      />
    </>
  )
}
