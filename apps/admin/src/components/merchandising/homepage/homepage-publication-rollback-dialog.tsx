import { useEffect, useState } from 'react'
import type {
  HomepagePublicationDto,
  HomepagePublicationSummaryDto,
  HomepageValidationIssue,
} from '@sabz/types'
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../../catalyst/alert'
import { Button } from '../../catalyst/button'
import { Field, Label } from '../../catalyst/fieldset'
import { Textarea } from '../../catalyst/textarea'
import { Text } from '../../catalyst/text'
import { InlineError } from '../../ui/inline-error'
import { StatusBadge } from '../../ui/status-badge'
import { formatTehranDateTime } from '../../../lib/tehran-time'
import {
  HOMEPAGE_PUBLICATION_STATUS_LABELS,
  homepagePublicationStatusLabel,
  homepagePublicationStatusTone,
} from '../../../lib/merchandising-status'
import { useHomepagePublicationRollback } from '../../../hooks/use-homepage-publication-rollback'

function IssueList({
  issues,
  tone,
}: {
  issues: HomepageValidationIssue[]
  tone: 'error' | 'warning'
}) {
  if (issues.length === 0) return null
  return (
    <ul className="space-y-1">
      {issues.map((issue, index) => (
        <li
          key={`${issue.path}-${issue.code}-${index}`}
          className={
            tone === 'error'
              ? 'rounded-lg bg-danger-subtle px-3 py-2 text-sm text-danger'
              : 'rounded-lg bg-warning-subtle px-3 py-2 text-sm text-warning'
          }
        >
          <span className="block">{issue.message}</span>
          <span className="mt-1 block text-xs text-muted">
            <span dir="ltr">{issue.path}</span> ·{' '}
            <span dir="ltr">{issue.code}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

export function HomepagePublicationRollbackDialog({
  open,
  publication,
  onClose,
  onRolledBack,
  onConflict,
}: {
  open: boolean
  publication:
    | HomepagePublicationSummaryDto
    | HomepagePublicationDto
    | null
  onClose: () => void
  onRolledBack: (
    publication: HomepagePublicationDto,
    source: HomepagePublicationSummaryDto | HomepagePublicationDto,
  ) => void
  onConflict: () => void
}) {
  const { rollingBack, rollback } = useHomepagePublicationRollback()
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [conflictErrors, setConflictErrors] = useState<
    HomepageValidationIssue[]
  >([])
  const [conflictWarnings, setConflictWarnings] = useState<
    HomepageValidationIssue[]
  >([])
  const [currentStatus, setCurrentStatus] = useState<string | null>(null)
  const [retryBlocked, setRetryBlocked] = useState(false)

  useEffect(() => {
    if (open) {
      setNote('')
      setError(null)
      setConflictErrors([])
      setConflictWarnings([])
      setCurrentStatus(null)
      setRetryBlocked(false)
    }
  }, [open])

  const eligible = publication?.status === 'SUPERSEDED'
  const canConfirm =
    eligible && publication !== null && !rollingBack && !retryBlocked

  const handleConfirm = async (): Promise<void> => {
    if (!publication || !eligible || rollingBack) {
      return
    }
    setError(null)
    setConflictErrors([])
    setConflictWarnings([])
    setCurrentStatus(null)
    const result = await rollback(publication.id, note)
    if (result.status === 'success') {
      onRolledBack(result.publication, publication)
      onClose()
      return
    }
    setError(result.message)
    if (result.status === 'conflict') {
      setRetryBlocked(true)
      setCurrentStatus(result.currentStatus)
      setConflictErrors(result.errors)
      setConflictWarnings(result.warnings)
      onConflict()
      return
    }
    if (result.status === 'not-found') {
      setRetryBlocked(true)
      onConflict()
      return
    }
    if (result.status === 'ambiguous') {
      setRetryBlocked(true)
    }
  }

  return (
    <Alert
      open={open}
      onClose={rollingBack ? () => undefined : onClose}
      size="lg"
    >
      <AlertTitle>بازگردانی نسخه صفحه اصلی</AlertTitle>
      <AlertDescription>
        {publication
          ? `از snapshot تغییرناپذیر نسخه ${publication.version.toLocaleString(
              'fa-IR',
            )} یک نسخه منتشرشده جدید ساخته می‌شود.`
          : ''}
      </AlertDescription>
      <AlertBody>
        <div className="space-y-4">
          {publication && (
            <div className="space-y-2 rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  tone={homepagePublicationStatusTone(publication.status)}
                >
                  {homepagePublicationStatusLabel(publication.status)}
                </StatusBadge>
                <span className="text-sm font-semibold text-foreground">
                  نسخه {publication.version.toLocaleString('fa-IR')}
                </span>
              </div>
              <p className="text-sm text-foreground">
                زمان انتشار اصلی: {formatTehranDateTime(publication.publishedAt)}
              </p>
              <p className="text-xs text-muted">
                پیش‌نویس منبع:{' '}
                {publication.sourceDraftRevision.toLocaleString('fa-IR')}
              </p>
              {publication.note && (
                <p className="text-xs text-muted">
                  یادداشت نسخه: {publication.note}
                </p>
              )}
              {publication.rollbackFromPublicationId && (
                <p className="text-xs text-muted">
                  این نسخه خودش از یک نسخه قبلی بازگردانی شده است:{' '}
                  <span dir="ltr">{publication.rollbackFromPublicationId}</span>
                </p>
              )}
            </div>
          )}

          {eligible ? (
            <div className="space-y-1 text-sm text-foreground">
              <p>
                با تأیید، یک نسخه جدید با محتوای همین snapshot تاریخی ساخته و
                منتشر می‌شود. نسخه منتشرشده فعلی «جایگزین‌شده» خواهد شد.
              </p>
              <p className="text-muted">
                پیش‌نویس صفحه اصلی تغییر نمی‌کند، snapshot تاریخی بازنویسی
                نمی‌شود، و نسخه‌های تاریخی قبلی دست‌نخورده می‌مانند.
              </p>
              <p className="text-muted">
                تا تأیید سرور، بازگردانی را موفق در نظر نگیرید. این صفحه
                پیش‌نمایش پیش‌نویس یا تعهد پاک‌سازی فوری cache/CDN ارائه نمی‌دهد.
              </p>
            </div>
          ) : (
            <p
              role="status"
              className="rounded-lg bg-warning-subtle px-3 py-2 text-sm text-warning"
            >
              فقط نسخه‌های تاریخی «جایگزین‌شده» برای بازگردانی قابل استفاده‌اند.
              نسخه جاری، زمان‌بندی‌شده یا لغوشده قابل بازگردانی نیست.
            </p>
          )}

          <Field>
            <Label htmlFor="homepage-rollback-note">یادداشت (اختیاری)</Label>
            <Textarea
              id="homepage-rollback-note"
              rows={2}
              maxLength={500}
              value={note}
              disabled={rollingBack || !eligible}
              onChange={(event) => setNote(event.target.value)}
            />
            <Text className="text-xs text-muted">حداکثر ۵۰۰ کاراکتر.</Text>
          </Field>

          {currentStatus && (
            <Text className="text-xs text-muted">
              وضعیت فعلی سرور:{' '}
              {(HOMEPAGE_PUBLICATION_STATUS_LABELS as Record<string, string>)[
                currentStatus
              ] ?? currentStatus}
            </Text>
          )}
          {retryBlocked && (
            <p className="rounded-lg bg-warning-subtle px-3 py-2 text-sm text-warning">
              پس از این تعارض، ارسال دوباره بدون بررسی وضعیت تازه مجاز نیست.
              جزئیات بالا و داده‌های به‌روزشده را بررسی کنید؛ برای تلاش آگاهانه
              دوباره، این گفت‌وگو را ببندید و از فهرست یا صفحه جزئیات باز کنید.
            </p>
          )}
          {(error ||
            conflictErrors.length > 0 ||
            conflictWarnings.length > 0 ||
            retryBlocked) && (
            <p role="status" aria-live="polite" className="sr-only">
              {conflictErrors.length > 0 || conflictWarnings.length > 0
                ? `بازگردانی انجام نشد؛ ${conflictErrors.length.toLocaleString(
                    'fa-IR',
                  )} خطا و ${conflictWarnings.length.toLocaleString(
                    'fa-IR',
                  )} هشدار تعارض گزارش شد. جزئیات در ادامه آمده است.`
                : (error ??
                  'بازگردانی متوقف شد؛ وضعیت تازه انتشار را بررسی کنید.')}
            </p>
          )}
          <IssueList issues={conflictErrors} tone="error" />
          <IssueList issues={conflictWarnings} tone="warning" />
          {error && <InlineError role="none" message={error} />}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={rollingBack}>
          انصراف
        </Button>
        <Button
          color="primary"
          disabled={!canConfirm}
          onClick={() => void handleConfirm()}
        >
          {rollingBack ? 'در حال بازگردانی…' : 'بازگردانی نسخه'}
        </Button>
      </AlertActions>
    </Alert>
  )
}
