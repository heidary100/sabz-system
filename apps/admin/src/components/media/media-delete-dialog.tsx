import { useEffect, useState } from 'react'
import type { ProductMediaSummary } from '@sabz/types'
import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { translateApiError, isConflictError } from '../../lib/error-messages'
import { formatFileSize } from '../../lib/format'
import { deleteProductMedia } from '../../services/media'

export function MediaDeleteDialog({
  open,
  media,
  onClose,
  onRefetch,
}: {
  open: boolean
  media: ProductMediaSummary | null
  onClose: () => void
  onRefetch: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setError(null)
      setSubmitting(false)
    }
  }, [open])

  const handleConfirm = async (): Promise<void> => {
    if (!media) {
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await deleteProductMedia(media.id)
      onClose()
      onRefetch()
    } catch (error) {
      // 409 (e.g. archived product race) and 404 (already deleted) mean the
      // server state is authoritative; refresh the detail so the UI never
      // keeps stale media rows.
      if (isConflictError(error)) {
        onRefetch()
      }
      setError(translateApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Alert open={open} onClose={onClose} size="sm">
      <AlertTitle>حذف رسانه</AlertTitle>
      <AlertDescription>
        {media
          ? `رسانه «${media.originalName}» (${formatFileSize(media.sizeBytes)}) از محصول حذف میشود.`
          : ''}
        {media?.isPrimary ? ' این تصویر، تصویر اصلی محصول است و پس از حذف، تصویر بعدی بهعنوان اصلی تعیین میشود.' : ''}
      </AlertDescription>
      {error && (
        <p className="mt-4 danger-box rounded-lg px-3 py-2 text-sm">
          {error}
        </p>
      )}
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color="red" onClick={() => void handleConfirm()} disabled={submitting}>
          {submitting ? 'در حال حذف…' : 'حذف'}
        </Button>
      </AlertActions>
    </Alert>
  )
}