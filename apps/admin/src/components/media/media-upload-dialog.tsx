import { useEffect, useMemo, useRef, useState } from 'react'
import type { VariantSummary } from '@sabz/types'
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage, Field, Label } from '../catalyst/fieldset'
import { Select } from '../catalyst/select'
import { Text } from '../catalyst/text'
import { translateApiError, isConflictError } from '../../lib/error-messages'
import { formatFileSize } from '../../lib/format'
import { uploadProductMediaWithProgress } from '../../services/media'

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
])

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024

function maxSizeForFile(file: File): number {
  return file.type.startsWith('video/') ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES
}

function sizeLimitLabel(file: File): string {
  return file.type.startsWith('video/') ? '۲۰۰ مگابایت' : '۱۰ مگابایت'
}

export function MediaUploadDialog({
  open,
  productId,
  variants,
  onClose,
  onSuccess,
  onConflict,
}: {
  open: boolean
  productId: string
  variants: VariantSummary[]
  onClose: () => void
  onSuccess: () => void
  onConflict: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [variantId, setVariantId] = useState('')
  const [uploadPercent, setUploadPercent] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'processing'>('idle')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setFile(null)
      setVariantId('')
      setError(null)
      setUploadPercent(0)
      setPhase('idle')
    }
  }, [open])

  const validationError = useMemo<string | null>(() => {
    if (!file) {
      return null
    }
    if (file.size > maxSizeForFile(file)) {
      return `حجم ${file.type.startsWith('video/') ? 'ویدئو' : 'تصویر'} باید حداکثر ${sizeLimitLabel(file)} باشد.`
    }
    if (file.type !== '' && !ALLOWED_MIME_TYPES.has(file.type)) {
      return 'فرمت فایل پشتیبانی نمیشود. فقط JPG، PNG، WEBP و MP4 مجاز است.'
    }
    return null
  }, [file])

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    setFile(event.target.files?.[0] ?? null)
    setError(null)
  }

  const busy = phase === 'uploading' || phase === 'processing'

  const handleSubmit = async (): Promise<void> => {
    if (!file) {
      setError('فایلی انتخاب نشده است.')
      return
    }
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setUploadPercent(0)
    setPhase('uploading')
    try {
      await uploadProductMediaWithProgress(
        productId,
        file,
        (percent) => {
          setUploadPercent(percent)
          // Body fully uploaded: the backend is now watermarking/processing
          // synchronously, so switch to the indeterminate processing state
          // until the response arrives.
          if (percent >= 100) {
            setPhase('processing')
          }
        },
        { ...(variantId !== '' ? { variantId } : {}) },
      )
      setPhase('idle')
      onSuccess()
    } catch (error) {
      setPhase('idle')
      if (isConflictError(error)) {
        onConflict()
      }
      setError(translateApiError(error))
    }
  }

  const canSubmit = file !== null && validationError === null && !busy

  return (
    <Alert open={open} onClose={busy ? () => undefined : onClose} size="3xl">
      <AlertTitle>افزودن رسانه</AlertTitle>
      <AlertDescription>
        تصویر (JPG، PNG، WEBP) تا ۱۰ مگابایت یا ویدئو (MP4) تا ۲۰۰ مگابایت را بارگذاری کنید. پس از
        بارگذاری، واترمارک برند به صورت خودکار اعمال میشود.
      </AlertDescription>
      <AlertBody>
        <div className="grid grid-cols-1 gap-5">
          <Field>
            <Label>فایل</Label>
            <input
              ref={inputRef}
              name="file"
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4"
              onChange={handleFileChange}
              disabled={busy}
              className="block w-full rounded-lg border border-zinc-950/10 bg-transparent px-3 py-2 text-sm/6 text-foreground data-disabled:opacity-50 dark:border-white/15 dark:text-white"
            />
            {file ? (
              <Text className="text-xs text-muted">
                <span dir="ltr">{file.name}</span> · <span dir="ltr">{file.type || 'نوع نامشخص'}</span> ·{' '}
                {formatFileSize(file.size)} · حداکثر {sizeLimitLabel(file)}
              </Text>
            ) : (
              <Text className="text-xs text-muted">فایلی انتخاب نشده است.</Text>
            )}
          </Field>

          <Field>
            <Label>واریانت</Label>
            <Select
              name="variantId"
              value={variantId}
              onChange={(event) => setVariantId(event.target.value)}
              disabled={busy || variants.length === 0}
            >
              <option value="">بدون واریانت</option>
              {variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.name ? `${variant.sku} — ${variant.name}` : variant.sku}
                </option>
              ))}
            </Select>
            <Text className="text-xs text-muted">
              اختیاری؛ رسانه فقط به واریانت های همین محصول قابل انتساب است.
            </Text>
          </Field>

          {phase === 'uploading' && (
            <div className="space-y-1.5">
              <div className="h-2 overflow-hidden rounded-full bg-surface-strong" dir="ltr">
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
            <div className="flex items-center gap-3 rounded-lg bg-primary-subtle px-4 py-3">
              <span
                aria-hidden="true"
                className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
              />
              <Text className="text-sm text-primary">در حال پردازش و اعمال واترمارک…</Text>
            </div>
          )}

          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={busy}>
          انصراف
        </Button>
        <Button color="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
          {phase === 'uploading' ? `در حال بارگذاری… ${uploadPercent}٪` : phase === 'processing' ? 'در حال پردازش…' : 'بارگذاری'}
        </Button>
      </AlertActions>
    </Alert>
  )
}