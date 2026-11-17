import { useEffect, useState } from 'react'
import type {
  HomepagePublicationDto,
  HomepagePublicationSummaryDto,
} from '@sabz/types'
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../../catalyst/alert'
import { Button } from '../../catalyst/button'
import { Text } from '../../catalyst/text'
import { InlineError } from '../../ui/inline-error'
import { StatusBadge } from '../../ui/status-badge'
import { formatTehranDateTime } from '../../../lib/tehran-time'
import {
  HOMEPAGE_PUBLICATION_STATUS_LABELS,
  homepagePublicationStatusLabel,
  homepagePublicationStatusTone,
} from '../../../lib/merchandising-status'
import { useHomepagePublicationCancel } from '../../../hooks/use-homepage-publication-cancel'

export function HomepagePublicationCancelDialog({
  open,
  publication,
  onClose,
  onCancelled,
  onConflict,
}: {
  open: boolean
  publication: HomepagePublicationSummaryDto | HomepagePublicationDto | null
  onClose: () => void
  onCancelled: (publication: HomepagePublicationDto) => void
  onConflict: () => void
}) {
  const { cancelling, cancel } = useHomepagePublicationCancel()
  const [error, setError] = useState<string | null>(null)
  const [currentStatus, setCurrentStatus] = useState<string | null>(null)
  const [retryBlocked, setRetryBlocked] = useState(false)

  useEffect(() => {
    if (open) {
      setError(null)
      setCurrentStatus(null)
      setRetryBlocked(false)
    }
  }, [open])

  const scheduled =
    publication?.status === 'SCHEDULED' && publication.publishAt !== null
  const canConfirm = scheduled && !cancelling && !retryBlocked

  const handleConfirm = async (): Promise<void> => {
    if (!publication || !scheduled || cancelling || retryBlocked) {
      return
    }
    setError(null)
    const result = await cancel(publication.id)
    if (result.status === 'success') {
      onCancelled(result.publication)
      onClose()
      return
    }
    setError(result.message)
    if (result.status === 'conflict') {
      setRetryBlocked(true)
      setCurrentStatus(result.currentStatus)
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
      onClose={cancelling ? () => undefined : onClose}
      size="lg"
    >
      <AlertTitle>لغو انتشار زمان‌بندی‌شده</AlertTitle>
      <AlertDescription>
        {publication
          ? `انتشار زمان‌بندی‌شده نسخه ${publication.version.toLocaleString(
              'fa-IR',
            )} لغو می‌شود. محتوای عمومی فعلی فروشگاه تغییر نمی‌کند.`
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
                زمان زمان‌بندی:{' '}
                {formatTehranDateTime(publication.publishAt)}
              </p>
              <p className="text-xs text-muted">
                پیش‌نویس منبع:{' '}
                {publication.sourceDraftRevision.toLocaleString('fa-IR')}
              </p>
              {publication.note && (
                <p className="text-xs text-muted">
                  یادداشت: {publication.note}
                </p>
              )}
            </div>
          )}

          {scheduled ? (
            <Text className="text-sm text-foreground">
              لغو فقط تا پیش از فعال‌سازی مجاز است. پس از فعال‌سازی، این نسخه
              منتشرشده یا به‌دلیل معتبر نبودن وابستگی‌ها توسط سیستم لغو می‌شود و
              دیگر قابل لغو دستی نیست. لغو دستی، نسخه‌های منتشرشده قبلی را تغییر
              نمی‌دهد.
            </Text>
          ) : (
            <p
              role="status"
              className="rounded-lg bg-warning-subtle px-3 py-2 text-sm text-warning"
            >
              این انتشار در وضعیت زمان‌بندی‌شده نیست و قابل لغو دستی نیست.
            </p>
          )}

          {currentStatus && (
            <Text className="text-xs text-muted">
              وضعیت فعلی سرور:{' '}
              {(HOMEPAGE_PUBLICATION_STATUS_LABELS as Record<string, string>)[
                currentStatus
              ] ?? currentStatus}
            </Text>
          )}
          {retryBlocked && (
            <p
              role="status"
              className="rounded-lg bg-warning-subtle px-3 py-2 text-sm text-warning"
            >
              پس از این تعارض، ارسال دوباره بدون بررسی وضعیت تازه مجاز نیست.
              جزئیات بالا و داده‌های به‌روزشده را بررسی کنید؛ برای تلاش آگاهانه
              دوباره، این گفت‌وگو را ببندید و از فهرست یا صفحه جزئیات باز کنید.
            </p>
          )}
          {error && <InlineError message={error} />}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={cancelling}>
          بستن
        </Button>
        <Button
          color="danger"
          disabled={!canConfirm}
          onClick={() => void handleConfirm()}
        >
          {cancelling ? 'در حال لغو…' : 'لغو انتشار'}
        </Button>
      </AlertActions>
    </Alert>
  )
}
