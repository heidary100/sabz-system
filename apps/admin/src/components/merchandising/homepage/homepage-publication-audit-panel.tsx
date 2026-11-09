import { useMemo, useState } from 'react'
import type {
  AuditEntry,
  HomepagePublicationSummaryDto,
} from '@sabz/types'
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
import { StatusBadge } from '../../ui/status-badge'
import { TableCard } from '../../ui/table-card'
import { AuditDetailsDialog } from '../../audit/audit-details-dialog'
import { useHomepagePublicationAudit } from '../../../hooks/use-homepage-publication-audit'
import { auditActionLabel } from '../../../lib/audit-labels'
import {
  auditActorLabel,
  auditEventDisposition,
  classifyPublicationDiagnostic,
  diagnosticCodeLabel,
} from '../../../lib/merchandising-publication-diagnostics'
import { formatTehranDateTime } from '../../../lib/tehran-time'
import { translateApiError } from '../../../lib/error-messages'

const REDACTED_AUDIT_KEYS = ['message', 'stack', 'exception', 'error'] as const

export function HomepagePublicationAuditPanel({
  publicationId,
  publication,
}: {
  publicationId: string | undefined
  publication: Pick<
    HomepagePublicationSummaryDto,
    'status' | 'rollbackFromPublicationId'
  >
}) {
  const { entries, total, loading, error, refetch } =
    useHomepagePublicationAudit(publicationId)
  const [selected, setSelected] = useState<AuditEntry | null>(null)

  const diagnostic = useMemo(
    () => classifyPublicationDiagnostic(publication, entries),
    [publication, entries],
  )

  if (!publicationId) {
    return null
  }

  if (loading && entries.length === 0) {
    return <Loading compact label="در حال بارگذاری گردش فعالیت…" />
  }

  if (error) {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-foreground">
          گردش فعالیت و تشخیص فعال‌سازی
        </p>
        <p className="text-sm text-muted">
          اطلاعات گردش فعالیت در دسترس نیست؛ دلیل لغو یا مسدود شدن را از وضعیت
          انتشار حدس نمی‌زنیم.
        </p>
        <ErrorState
          size="compact"
          message={translateApiError(error)}
          onRetry={() => void refetch()}
        />
      </div>
    )
  }

  return (
    <>
      <section className="space-y-4 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              تشخیص وضعیت انتشار
            </h2>
            <p className="text-xs text-muted">
              این تشخیص فقط از وضعیت معتبر سرور و رویدادهای ثبت‌شده آن ساخته
              می‌شود؛ از وضعیت «لغوشده» به‌تنهایی دلیلی استنتاج نمی‌شود.
            </p>
          </div>
          <StatusBadge tone={diagnostic.tone}>{diagnostic.label}</StatusBadge>
        </div>

        <p className="rounded-lg bg-background/60 px-3 py-2 text-sm text-foreground">
          {diagnostic.summary}
        </p>

        {diagnostic.retryable && (
          <p
            role="status"
            className="rounded-lg bg-warning-subtle px-3 py-2 text-sm text-warning"
          >
            این خطا موقت است و نسخه همچنان «زمان‌بندی‌شده» باقی مانده است؛
            سرور ممکن است در تلاش بعدی دوباره آن را بررسی کند. این وضعیت را
            لغو قطعی تلقی نکنید.
          </p>
        )}

        {diagnostic.failureCodes.length > 0 && (
          <div className="space-y-2 rounded-lg border border-border bg-background/40 p-3">
            <p className="text-sm font-medium text-foreground">
              کدهای تشخیصی ثبت‌شده
            </p>
            <ul className="space-y-1">
              {diagnostic.failureCodes.map((code) => {
                const label = diagnosticCodeLabel(code)
                return (
                  <li key={code} className="text-sm text-foreground">
                    {label === code ? (
                      <span dir="ltr">{code}</span>
                    ) : (
                      <>
                        {label}{' '}
                        <span dir="ltr" className="text-xs text-muted">
                          ({code})
                        </span>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {diagnostic.evidence && (
          <p className="text-xs text-muted">
            شاهد رویداد: {auditActionLabel(diagnostic.evidence.action)} ·{' '}
            {auditActorLabel(diagnostic.evidence)} ·{' '}
            {formatTehranDateTime(diagnostic.evidence.createdAt)}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            نمایش {entries.length.toLocaleString('fa-IR')} رویداد از{' '}
            {total.toLocaleString('fa-IR')} رویداد ثبت‌شده.
          </p>
          <Button plain onClick={() => void refetch()} disabled={loading}>
            به‌روزرسانی گردش فعالیت
          </Button>
        </div>

        {entries.length === 0 ? (
          <EmptyState
            size="compact"
            title="رویدادی ثبت نشده است"
            description="اگر رویدادی ثبت شده باشد، پس از به‌روزرسانی این بخش نمایش داده می‌شود. نبود رویداد به‌تنهایی دلیل بر موفقیت یا شکست نیست."
          />
        ) : (
          <TableCard>
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader>نوع</TableHeader>
                  <TableHeader>رویداد</TableHeader>
                  <TableHeader>عامل</TableHeader>
                  <TableHeader>زمان (تهران)</TableHeader>
                  <TableHeader>جزئیات</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.map((entry) => {
                  const disposition = auditEventDisposition(entry.action)
                  return (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <StatusBadge tone={disposition.tone}>
                          {disposition.label}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>{auditActionLabel(entry.action)}</TableCell>
                      <TableCell className="text-muted">
                        <span dir="auto">{auditActorLabel(entry)}</span>
                      </TableCell>
                      <TableCell className="text-muted">
                        {formatTehranDateTime(entry.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Button plain onClick={() => setSelected(entry)}>
                          مشاهده
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableCard>
        )}

        <p className="text-xs text-muted">
          این فهرست محدود است و پیام خام خطا یا داده حساس را نمایش نمی‌دهد.
          کدهای ناشناخته بدون حذف شدن نمایش داده می‌شوند.
        </p>
      </section>
      <AuditDetailsDialog
        entry={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
        redactKeys={REDACTED_AUDIT_KEYS}
        timestampFormatter={formatTehranDateTime}
      />
    </>
  )
}
