import { useEffect, useState } from 'react'
import type { PartnerDocumentSummary } from '@sabz/types'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { Text } from '../catalyst/text'
import { translateApiError } from '../../lib/error-messages'
import { formatDate, formatFileSize } from '../../lib/format'
import { PARTNER_DOCUMENT_TYPE_LABELS } from '../../lib/partner-labels'
import { downloadPartnerDocument } from '../../services/partners'

const PREVIEW_MIMES = new Set(['application/pdf', 'image/png', 'image/jpeg'])

function isPreviewable(document: PartnerDocumentSummary): boolean {
  return PREVIEW_MIMES.has(document.mimeType)
}

export function DocumentPreviewDialog({
  open,
  partnerId,
  document,
  onClose,
}: {
  open: boolean
  partnerId: string
  document: PartnerDocumentSummary | null
  onClose: () => void
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !document) {
      return
    }

    let cancelled = false
    let url: string | null = null

    const load = async (): Promise<void> => {
      setLoading(true)
      setError(null)
      try {
        const blob = await downloadPartnerDocument(partnerId, document.id)
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
  }, [open, document, partnerId])

  if (!document) {
    return null
  }

  const previewable = isPreviewable(document)

  const handleDownload = async (): Promise<void> => {
    try {
      const blob = await downloadPartnerDocument(partnerId, document.id)
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = document.originalName
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      setError(translateApiError(error))
    }
  }

  return (
    <Alert open={open} onClose={onClose} size="4xl">
      <AlertTitle>{PARTNER_DOCUMENT_TYPE_LABELS[document.type]}</AlertTitle>
      <AlertDescription>
        {document.originalName} · {document.mimeType} · {formatFileSize(document.sizeBytes)} ·{' '}
        {formatDate(document.createdAt)}
      </AlertDescription>
      <AlertBody>
        {loading ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3" role="status">
            <span
              aria-hidden="true"
              className="size-8 animate-spin rounded-full border-2 border-hunter-800 border-t-primary"
            />
            <span className="text-sm font-medium text-dust-200">در حال بارگذاری سند…</span>
          </div>
        ) : error ? (
          <Text className="text-red-700">{error}</Text>
        ) : objectUrl ? (
          previewable ? (
            document.mimeType === 'application/pdf' ? (
              <iframe
                title={document.originalName}
                src={objectUrl}
                className="h-[28rem] w-full rounded-lg border border-border bg-white"
              />
            ) : (
              <div className="flex justify-center bg-white p-4">
                <img
                  src={objectUrl}
                  alt={document.originalName}
                  className="max-h-96 rounded-lg object-contain"
                />
              </div>
            )
          ) : (
            <Text>پیش‌نمایش برای این نوع فایل در دسترس نیست.</Text>
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