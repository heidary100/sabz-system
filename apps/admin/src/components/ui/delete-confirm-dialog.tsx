import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { translateApiError } from '../../lib/error-messages'

export function DeleteConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pendingLabel = 'در حال حذف…',
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  pendingLabel?: string
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async (): Promise<void> => {
    setSubmitting(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (error) {
      setError(translateApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Alert open={open} onClose={onClose} size="sm">
      <AlertBody>
        <TriangleAlert
          className="mx-auto mb-3 size-8 text-red-600 dark:text-red-400"
          aria-hidden="true"
        />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
        {error && (
          <p className="mt-4 danger-box rounded-lg px-3 py-2 text-sm">
            {error}
          </p>
        )}
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color="red" onClick={() => void handleConfirm()} disabled={submitting}>
          {submitting ? pendingLabel : confirmLabel}
        </Button>
      </AlertActions>
    </Alert>
  )
}
