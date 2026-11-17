import { useEffect, useMemo, useState } from 'react'
import type { MerchMediaDetailDto, MerchMediaSummaryDto } from '@sabz/types'
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../catalyst/alert'
import { Button } from '../catalyst/button'
import {
  ErrorMessage,
  Field,
  Label,
} from '../catalyst/fieldset'
import { Input } from '../catalyst/input'
import { Text } from '../catalyst/text'
import { InfoItem } from '../ui/info-item'
import { InlineError } from '../ui/inline-error'
import { formatDateTime, formatFileSize } from '../../lib/format'
import {
  MERCH_MEDIA_ALT_MAX_LENGTH,
  formatMerchMediaDimensions,
  isMerchMediaUsageKnown,
  merchMediaErrorMessage,
} from '../../lib/merchandising-media'
import {
  getMerchMedia,
  getMerchMediaFile,
  updateMerchMedia,
} from '../../services/merchandising'
import { MerchMediaStatusBadge } from './merch-media-status-badge'
import { MerchMediaUsage } from './merch-media-usage'

export function MerchMediaDetailDialog({
  open,
  media,
  onClose,
  onChanged,
}: {
  open: boolean
  media: MerchMediaSummaryDto | null
  onClose: () => void
  onChanged: () => void
}) {
  const [detail, setDetail] = useState<MerchMediaDetailDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [altFa, setAltFa] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewState, setPreviewState] = useState<
    'loading' | 'ready' | 'error'
  >('loading')

  useEffect(() => {
    if (!open || !media) {
      return
    }

    let cancelled = false
    let objectUrl: string | null = null

    setDetail(null)
    setLoading(true)
    setLoadError(null)
    setAltFa('')
    setSaving(false)
    setSaveError(null)
    setSaved(false)
    setPreviewUrl(null)
    setPreviewState('loading')

    void getMerchMedia(media.id)
      .then((data) => {
        if (cancelled) {
          return
        }
        setDetail(data)
        setAltFa(data.altFa ?? '')
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(merchMediaErrorMessage(error))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    void getMerchMediaFile(media.id)
      .then((blob) => {
        if (cancelled) {
          return
        }
        objectUrl = URL.createObjectURL(blob)
        setPreviewUrl(objectUrl)
        setPreviewState('ready')
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewState('error')
        }
      })

    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [open, media])

  const altError =
    altFa.length > MERCH_MEDIA_ALT_MAX_LENGTH
      ? `متن جایگزین باید حداکثر ${MERCH_MEDIA_ALT_MAX_LENGTH} کاراکتر باشد.`
      : null
  const altChanged =
    detail !== null && altFa.trim() !== (detail.altFa ?? '')
  const canSave = detail !== null && altChanged && !altError && !saving

  const usage = detail?.usage
  const usageKnown = isMerchMediaUsageKnown(usage)

  const statusExplanation = useMemo(() => {
    if (detail?.status === 'PUBLISHED') {
      return 'این رسانه در نسخه جاری صفحه اصلی استفاده می‌شود؛ وضعیت آن دستی قابل تغییر نیست.'
    }
    return 'این رسانه عمومی نیست؛ بارگذاری یا اتصال به کمپین به‌تنهایی آن را منتشر نمی‌کند.'
  }, [detail?.status])

  const handleSave = async (): Promise<void> => {
    if (!detail || !canSave) {
      return
    }
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      const updated = await updateMerchMedia(detail.id, {
        altFa: altFa.trim() || null,
      })
      setDetail((current) => (current ? { ...current, ...updated } : current))
      setAltFa(updated.altFa ?? '')
      setSaved(true)
      onChanged()
    } catch (error) {
      setSaveError(merchMediaErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Alert open={open} onClose={onClose} size="4xl">
      <AlertTitle>جزئیات رسانه</AlertTitle>
      <AlertDescription>
        پیش‌نمایش از مسیر احراز‌شده مدیریت بارگذاری می‌شود. فقط متن جایگزین
        قابل ویرایش است و نقطه کانونی به ویرایشگر کمپین تعلق دارد.
      </AlertDescription>
      <AlertBody>
        {loading ? (
          <div
            role="status"
            className="flex min-h-48 flex-col items-center justify-center gap-3"
          >
            <span
              aria-hidden="true"
              className="size-8 animate-spin rounded-full border-2 border-hunter-800 border-t-primary motion-reduce:animate-none"
            />
            <span className="text-sm font-medium text-muted">
              در حال بارگذاری جزئیات…
            </span>
          </div>
        ) : loadError ? (
          <InlineError message={loadError} />
        ) : detail ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="flex min-h-56 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-strong p-3">
                {previewState === 'loading' ? (
                  <div
                    role="status"
                    className="flex flex-col items-center gap-2 text-muted"
                  >
                    <span
                      aria-hidden="true"
                      className="size-7 animate-spin rounded-full border-2 border-hunter-800 border-t-primary motion-reduce:animate-none"
                    />
                    <span className="text-xs">در حال بارگذاری فایل…</span>
                  </div>
                ) : previewState === 'ready' && previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={detail.altFa ?? detail.originalName}
                    className="max-h-96 max-w-full rounded-lg object-contain"
                  />
                ) : (
                  <Text className="text-sm text-muted">
                    پیش‌نمایش فایل در دسترس نیست؛ اطلاعات رسانه همچنان قابل
                    مشاهده است.
                  </Text>
                )}
              </div>

              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InfoItem label="نام فایل" value={detail.originalName} />
                <InfoItem label="نوع فایل" value={detail.mimeType} />
                <InfoItem label="حجم" value={formatFileSize(detail.sizeBytes)} />
                <InfoItem
                  label="ابعاد"
                  value={formatMerchMediaDimensions(detail.width, detail.height)}
                />
                <InfoItem label="تاریخ ایجاد" value={formatDateTime(detail.createdAt)} />
                <InfoItem
                  label="آخرین به‌روزرسانی"
                  value={formatDateTime(detail.updatedAt)}
                />
                <InfoItem
                  label="زمان انتشار"
                  value={formatDateTime(detail.publishedAt)}
                />
              </dl>
            </div>

            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3">
                <MerchMediaStatusBadge status={detail.status} />
                <span className="text-xs text-muted" dir="ltr">
                  {detail.id}
                </span>
              </div>
              <Text className="text-sm text-muted">{statusExplanation}</Text>

              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void handleSave()
                }}
              >
                <Field>
                  <Label htmlFor="merch-media-detail-alt">
                    متن جایگزین (alt)
                  </Label>
                  <Input
                    id="merch-media-detail-alt"
                    name="altFa"
                    value={altFa}
                    maxLength={MERCH_MEDIA_ALT_MAX_LENGTH}
                    onChange={(event) => {
                      setAltFa(event.target.value)
                      setSaved(false)
                    }}
                    disabled={saving}
                    placeholder="توضیح کوتاه تصویر برای دسترس‌پذیری"
                  />
                  <Text className="text-xs text-muted">
                    فقط همین فیلد در کتابخانه رسانه قابل ویرایش است؛ حداکثر{' '}
                    {MERCH_MEDIA_ALT_MAX_LENGTH} کاراکتر.
                  </Text>
                  {altError && <ErrorMessage>{altError}</ErrorMessage>}
                </Field>
                {saveError && <InlineError message={saveError} />}
                {saved && (
                  <p
                    role="status"
                    className="rounded-lg bg-success-subtle px-3 py-2 text-sm text-success"
                  >
                    متن جایگزین ذخیره شد.
                  </p>
                )}
                <Button
                  color="primary"
                  type="submit"
                  disabled={!canSave}
                >
                  {saving ? 'در حال ذخیره…' : 'ذخیره متن جایگزین'}
                </Button>
              </form>

              <section
                aria-labelledby="merch-media-usage-heading"
                className="space-y-3 rounded-xl border border-border bg-surface p-4"
              >
                <h3
                  id="merch-media-usage-heading"
                  className="text-sm font-semibold text-foreground"
                >
                  استفاده در کمپین‌ها و صفحه اصلی
                </h3>
                {!usageKnown ? (
                  <Text className="text-sm text-muted">
                    اطلاعات استفاده در پاسخ سرور موجود نیست؛ برای حذف، پاسخ
                    سرور مرجع است.
                  </Text>
                ) : (
                  <MerchMediaUsage usage={usage} showBlockingNote />
                )}
              </section>
            </div>
          </div>
        ) : null}
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={saving}>
          بستن
        </Button>
      </AlertActions>
    </Alert>
  )
}
