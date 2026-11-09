import { useEffect, useMemo, useState } from 'react'
import type { MerchMediaSummaryDto } from '@sabz/types'
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage, Field, Label } from '../catalyst/fieldset'
import { Input } from '../catalyst/input'
import { Text } from '../catalyst/text'
import { InlineError } from '../ui/inline-error'
import { formatFileSize } from '../../lib/format'
import {
  MERCH_MEDIA_ALT_MAX_LENGTH,
  MERCH_MEDIA_ALLOWED_MIME_TYPES,
  MERCH_MEDIA_MAX_IMAGE_SIZE_BYTES,
  merchMediaErrorMessage,
  validateMerchMediaFile,
} from '../../lib/merchandising-media'
import { uploadMerchMedia } from '../../services/merchandising'

type UploadPhase = 'idle' | 'uploading' | 'processing'

export function MerchMediaUploadDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  onSuccess: (media: MerchMediaSummaryDto) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [altFa, setAltFa] = useState('')
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [uploadPercent, setUploadPercent] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setFile(null)
      setAltFa('')
      setPhase('idle')
      setUploadPercent(0)
      setError(null)
    }
  }, [open])

  const fileError = useMemo(
    () => (file ? validateMerchMediaFile(file) : null),
    [file],
  )
  const altError =
    altFa.length > MERCH_MEDIA_ALT_MAX_LENGTH
      ? `متن جایگزین باید حداکثر ${MERCH_MEDIA_ALT_MAX_LENGTH} کاراکتر باشد.`
      : null
  const busy = phase === 'uploading' || phase === 'processing'
  const canSubmit = file !== null && !fileError && !altError && !busy

  const handleSubmit = async (): Promise<void> => {
    if (!file) {
      setError('فایلی انتخاب نشده است.')
      return
    }
    if (fileError || altError) {
      setError(fileError ?? altError)
      return
    }

    setError(null)
    setUploadPercent(0)
    setPhase('uploading')
    try {
      const media = await uploadMerchMedia(file, {
        altFa,
        onProgress: (percent) => {
          setUploadPercent(percent)
          if (percent >= 100) {
            setPhase('processing')
          }
        },
      })
      setPhase('idle')
      onSuccess(media)
    } catch (error) {
      setPhase('idle')
      setError(merchMediaErrorMessage(error))
    }
  }

  return (
    <Alert open={open} onClose={busy ? () => undefined : onClose} size="lg">
      <AlertTitle>بارگذاری رسانه بازاریابی</AlertTitle>
      <AlertDescription>
        تصویر JPG، PNG یا WEBP تا ۱۰ مگابایت بارگذاری کنید. رسانه تازه
        «منتشرنشده» است و تا انتشار صفحه اصلی در فروشگاه دیده نمی‌شود.
      </AlertDescription>
      <AlertBody>
        <div className="grid grid-cols-1 gap-5">
          <Field>
            <Label htmlFor="merch-media-file">فایل تصویر</Label>
            <input
              id="merch-media-file"
              name="file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null)
                setError(null)
              }}
              disabled={busy}
              className="block w-full rounded-lg border border-zinc-950/10 bg-transparent px-3 py-2 text-sm/6 text-foreground data-disabled:opacity-50 dark:border-white/15 dark:text-white"
            />
            {file ? (
              <Text className="text-xs text-muted">
                <span dir="ltr">{file.name}</span> ·{' '}
                <span dir="ltr">{file.type || 'نوع نامشخص'}</span> ·{' '}
                {formatFileSize(file.size)} · حداکثر{' '}
                {formatFileSize(MERCH_MEDIA_MAX_IMAGE_SIZE_BYTES)}
              </Text>
            ) : (
              <Text className="text-xs text-muted">
                فایلی انتخاب نشده است.
              </Text>
            )}
            {file &&
              file.type !== '' &&
              !MERCH_MEDIA_ALLOWED_MIME_TYPES.has(file.type) && (
                <ErrorMessage>
                  فقط تصویر JPG، PNG و WEBP مجاز است.
                </ErrorMessage>
              )}
            {fileError && <ErrorMessage>{fileError}</ErrorMessage>}
          </Field>

          <Field>
            <Label htmlFor="merch-media-alt">متن جایگزین (اختیاری)</Label>
            <Input
              id="merch-media-alt"
              name="altFa"
              value={altFa}
              maxLength={MERCH_MEDIA_ALT_MAX_LENGTH}
              onChange={(event) => setAltFa(event.target.value)}
              disabled={busy}
              placeholder="توضیح کوتاه تصویر برای دسترس‌پذیری"
            />
            <Text className="text-xs text-muted">
              تنها فیلد قابل ویرایش در کتابخانه رسانه است؛ حداکثر{' '}
              {MERCH_MEDIA_ALT_MAX_LENGTH} کاراکتر.
            </Text>
            {altError && <ErrorMessage>{altError}</ErrorMessage>}
          </Field>

          {phase === 'uploading' && (
            <div className="space-y-1.5">
              <div
                className="h-2 overflow-hidden rounded-full bg-surface-strong"
                dir="ltr"
              >
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.max(2, uploadPercent)}%` }}
                />
              </div>
              <Text className="text-xs text-muted" dir="ltr">
                در حال بارگذاری… {uploadPercent}٪
              </Text>
            </div>
          )}

          {phase === 'processing' && (
            <div
              role="status"
              className="flex items-center gap-3 rounded-lg bg-primary-subtle px-4 py-3"
            >
              <span
                aria-hidden="true"
                className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none"
              />
              <Text className="text-sm text-primary">
                در حال پردازش تصویر…
              </Text>
            </div>
          )}

          {error && <InlineError message={error} />}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={busy}>
          انصراف
        </Button>
        <Button
          color="primary"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
        >
          {phase === 'uploading'
            ? `در حال بارگذاری… ${uploadPercent}٪`
            : phase === 'processing'
              ? 'در حال پردازش…'
              : 'بارگذاری'}
        </Button>
      </AlertActions>
    </Alert>
  )
}
