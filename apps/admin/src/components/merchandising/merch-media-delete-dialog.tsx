import { useCallback, useEffect, useRef, useState } from 'react'
import type { MerchMediaDetailDto, MerchMediaSummaryDto } from '@sabz/types'
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { Text } from '../catalyst/text'
import { InlineError } from '../ui/inline-error'
import {
  hasMerchMediaUsage,
  isMerchMediaUsageKnown,
  merchMediaErrorMessage,
} from '../../lib/merchandising-media'
import { parseMerchandisingError } from '../../lib/merchandising-errors'
import { deleteMerchMedia, getMerchMedia } from '../../services/merchandising'
import { MerchMediaUsage } from './merch-media-usage'

export function MerchMediaDeleteDialog({
  open,
  media,
  onClose,
  onDeleted,
  onConflict,
}: {
  open: boolean
  media: MerchMediaSummaryDto | null
  onClose: () => void
  onDeleted: (media: MerchMediaSummaryDto) => void
  onConflict: () => void
}) {
  const [detail, setDetail] = useState<MerchMediaDetailDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const requestSeq = useRef(0)

  const loadDetail = useCallback(async (mediaId: string): Promise<void> => {
    const seq = ++requestSeq.current
    setLoading(true)
    setLoadError(null)
    try {
      const data = await getMerchMedia(mediaId)
      if (seq === requestSeq.current) {
        setDetail(data)
      }
    } catch (error) {
      if (seq === requestSeq.current) {
        setDetail(null)
        setLoadError(merchMediaErrorMessage(error))
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!open || !media) {
      return
    }
    setActionError(null)
    setSubmitting(false)
    void loadDetail(media.id)
    return () => {
      requestSeq.current += 1
    }
  }, [open, media, loadDetail])

  const usage = detail?.usage
  const usageKnown = isMerchMediaUsageKnown(usage)
  const usagePresent = usageKnown && hasMerchMediaUsage(usage)
  const canConfirm =
    media !== null &&
    detail !== null &&
    !loading &&
    !loadError &&
    !usagePresent &&
    !submitting

  const handleConfirm = async (): Promise<void> => {
    if (!media || !canConfirm) {
      return
    }
    setSubmitting(true)
    setActionError(null)
    try {
      await deleteMerchMedia(media.id)
      onDeleted(detail)
    } catch (error) {
      const parsed = parseMerchandisingError(error)
      setActionError(merchMediaErrorMessage(error))
      // 409/404 mean the server's reference state is authoritative: refresh the
      // list and (for conflicts) the usage detail so the dialog stops showing a
      // stale "unused" summary.
      if (parsed?.status === 409 || parsed?.status === 404) {
        onConflict()
        if (parsed.status === 409) {
          void loadDetail(media.id)
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Alert open={open} onClose={submitting ? () => undefined : onClose} size="lg">
      <AlertTitle>حذف رسانه از کتابخانه</AlertTitle>
      <AlertDescription>
        {media
          ? `رسانه «${media.originalName}» از کتابخانه پنهان می‌شود. این حذف نرم است؛ فایل برای یکپارچگی نسخه‌های تاریخی نگهداری می‌شود و امکان بازگردانی از این رابط وجود ندارد.`
          : ''}
      </AlertDescription>
      <AlertBody>
        {loading ? (
          <div
            role="status"
            className="flex items-center justify-center gap-3 py-8"
          >
            <span
              aria-hidden="true"
              className="size-5 animate-spin rounded-full border-2 border-hunter-800 border-t-primary motion-reduce:animate-none"
            />
            <span className="text-sm font-medium text-muted">
              در حال بررسی استفاده رسانه…
            </span>
          </div>
        ) : loadError ? (
          <div className="space-y-3">
            <InlineError message={loadError} />
            <Button
              outline
              onClick={() => {
                if (media) {
                  void loadDetail(media.id)
                }
              }}
            >
              بررسی مجدد
            </Button>
          </div>
        ) : detail ? (
          <div className="space-y-4">
            <section
              aria-labelledby="merch-media-delete-usage-heading"
              className="space-y-3 rounded-xl border border-border bg-surface p-4"
            >
              <h3
                id="merch-media-delete-usage-heading"
                className="text-sm font-semibold text-foreground"
              >
                استفاده فعلی
              </h3>
              {usageKnown ? (
                <MerchMediaUsage usage={usage} />
              ) : (
                <Text className="text-sm text-muted">
                  اطلاعات استفاده در پاسخ سرور موجود نیست؛ حذف فقط با تصمیم
                  سرور انجام می‌شود.
                </Text>
              )}
            </section>

            {usagePresent && (
              <p
                role="status"
                className="rounded-lg bg-warning-subtle px-3 py-2 text-sm text-warning"
              >
                این رسانه در کمپین یا نسخه صفحه اصلی استفاده می‌شود و حذف آن
                مسدود است. ابتدا ارجاع‌ها را حذف کنید.
              </p>
            )}

            {actionError && <InlineError message={actionError} />}
          </div>
        ) : null}
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button
          color="red"
          onClick={() => void handleConfirm()}
          disabled={!canConfirm}
        >
          {submitting ? 'در حال حذف…' : 'حذف رسانه'}
        </Button>
      </AlertActions>
    </Alert>
  )
}
