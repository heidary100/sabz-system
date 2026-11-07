import { useState } from 'react'
import { Alert, AlertActions, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { translateApiError } from '../../lib/error-messages'
import { InlineError } from '../ui/inline-error'

export function LifecycleConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pendingLabel,
  color = 'primary',
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  pendingLabel: string
  color?: 'primary' | 'red'
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
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      {error && (
        <InlineError className="mt-4" message={error} />
      )}
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color={color} onClick={() => void handleConfirm()} disabled={submitting}>
          {submitting ? pendingLabel : confirmLabel}
        </Button>
      </AlertActions>
    </Alert>
  )
}
