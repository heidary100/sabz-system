import { useEffect, useState } from 'react'
import type { ProductMediaSummary } from '@sabz/types'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { Text } from '../catalyst/text'
import { translateApiError } from '../../lib/error-messages'
import { formatDateTime, formatFileSize } from '../../lib/format'
import { PRODUCT_MEDIA_TYPE_LABELS } from '../../lib/product-labels'
import { downloadProductMedia } from '../../services/media'

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function MediaPreviewDialog({
  open,
  productId,
  media,
  onClose,
}: {
  open: boolean
  productId: string
  media: ProductMediaSummary | null
  onClose: () => void
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !media) {
      return
    }

    let cancelled = false
    let url: string | null = null

    const load = async (): Promise<void> => {
      setLoading(true)
      setError(null)
      try {
        const blob = await downloadProductMedia(productId, media.id)
        if (cancelled) {
          return
        }
        url = URL.createObjectURL(blob)
        setObjectUrl(url)
      } catch (error) {
        if (!cancelled) {
          setError(translateApiError(error))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
      if (url) {
        URL.revokeObjectURL(url)
      }
      setObjectUrl(null)
      setLoading(false)
      setError(null)
    }
  }, [open, media, productId])

  if (!media) {
    return null
  }

  const isImage = IMAGE_MIMES.has(media.mimeType)

  const handleDownload = async (): Promise<void> => {
    try {
      const blob = await downloadProductMedia(productId, media.id)
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = media.originalName
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      setError(translateApiError(error))
    }
  }

  return (
    <Alert open={open} onClose={onClose} size="4xl">
      <AlertTitle>{PRODUCT_MEDIA_TYPE_LABELS[media.mediaType]}</AlertTitle>
      <AlertDescription>
        <span dir="ltr">{media.originalName}</span> · <span dir="ltr">{media.mimeType}</span> ·{' '}
        {formatFileSize(media.sizeBytes)} · {formatDateTime(media.createdAt)}
      </AlertDescription>
      <AlertBody>
        {loading ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3" role="status">
            <span
              aria-hidden="true"
              className="size-8 animate-spin rounded-full border-2 border-hunter-800 border-t-primary"
            />
            <span className="text-sm font-medium text-muted">در حال بارگذاری رسانه…</span>
          </div>
        ) : error ? (
          <Text className="text-red-700 dark:text-red-400">{error}</Text>
        ) : objectUrl ? (
          isImage ? (
            <div className="flex justify-center bg-surface p-4">
              <img
                src={objectUrl}
                alt={media.originalName}
                className="max-h-96 rounded-lg object-contain"
              />
            </div>
          ) : media.mimeType === 'video/mp4' ? (
            <div className="flex justify-center bg-black/5 p-4">
              <video
                src={objectUrl}
                controls
                className="max-h-96 w-full rounded-lg object-contain"
              >
                پیش نمایش ویدئو در این مرورگر در دسترس نیست.
              </video>
            </div>
          ) : (
            <Text>پیش نمایش برای این نوع فایل در دسترس نیست.</Text>
          )
        ) : null}
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose}>
          بستن
        </Button>
        <Button color="primary" onClick={() => void handleDownload()}>
          دانلود
        </Button>
      </AlertActions>
    </Alert>
  )
}