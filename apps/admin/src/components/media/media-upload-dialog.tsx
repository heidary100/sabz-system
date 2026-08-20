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
import { uploadProductMedia } from '../../services/media'

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
])

const MAX_MEDIA_SIZE_BYTES = 10 * 1024 * 1024

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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setFile(null)
      setVariantId('')
      setError(null)
      setSubmitting(false)
    }
  }, [open])

  const validationError = useMemo<string | null>(() => {
    if (!file) {
      return null
    }
    if (file.size > MAX_MEDIA_SIZE_BYTES) {
      return 'حجم فایل باید حداکثر ۱۰ مگابایت باشد.'
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

  const handleSubmit = async (): Promise<void> => {
    if (!file) {
      setError('فایلی انتخاب نشده است.')
      return
    }
    if (validationError) {
      setError(validationError)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await uploadProductMedia(productId, file, {
        ...(variantId !== '' ? { variantId } : {}),
      })
      onSuccess()
    } catch (error) {
      if (isConflictError(error)) {
        onConflict()
      }
      setError(translateApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = file !== null && validationError === null && !submitting

  return (
    <Alert open={open} onClose={onClose} size="3xl">
      <AlertTitle>افزودن رسانه</AlertTitle>
      <AlertDescription>
        تصویر (JPG، PNG، WEBP) یا ویدئو (MP4) با حداکثر حجم ۱۰ مگابایت را بارگذاری کنید.
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
              disabled={submitting}
              className="block w-full rounded-lg border border-zinc-950/10 bg-transparent px-3 py-2 text-sm/6 text-zinc-950 data-disabled:opacity-50 dark:border-white/10 dark:text-white"
            />
            {file ? (
              <Text className="text-xs text-zinc-500">
                <span dir="ltr">{file.name}</span> · <span dir="ltr">{file.type || 'نوع نامشخص'}</span> ·{' '}
                {formatFileSize(file.size)}
              </Text>
            ) : (
              <Text className="text-xs text-zinc-500">فایلی انتخاب نشده است.</Text>
            )}
          </Field>

          <Field>
            <Label>واریانت</Label>
            <Select
              name="variantId"
              value={variantId}
              onChange={(event) => setVariantId(event.target.value)}
              disabled={submitting || variants.length === 0}
            >
              <option value="">بدون واریانت</option>
              {variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.name ? `${variant.sku} — ${variant.name}` : variant.sku}
                </option>
              ))}
            </Select>
            <Text className="text-xs text-zinc-500">
              اختیاری؛ رسانه فقط به واریانتهای همین محصول قابل انتساب است.
            </Text>
          </Field>

          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
          {submitting ? 'در حال بارگذاری…' : 'بارگذاری'}
        </Button>
      </AlertActions>
    </Alert>
  )
}