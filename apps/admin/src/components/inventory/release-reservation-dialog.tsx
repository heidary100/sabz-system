import { useEffect, useState } from 'react'
import type { ReservationSummary } from '@sabz/types'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage } from '../catalyst/fieldset'
import { isConflictError, translateApiError } from '../../lib/error-messages'
import { releaseReservation } from '../../services/inventory'

export function ReleaseReservationDialog({
  open,
  reservation,
  onClose,
  onSuccess,
  onConflict,
}: {
  open: boolean
  reservation: ReservationSummary | null
  onClose: () => void
  onSuccess: () => void
  onConflict: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setError(null)
    }
  }, [open])

  const handleSubmit = async (): Promise<void> => {
    if (!reservation) {
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await releaseReservation(reservation.id)
      onSuccess()
    } catch (error) {
      setError(translateApiError(error))
      if (isConflictError(error)) {
        onConflict()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Alert open={open} onClose={onClose} size="sm">
      <AlertTitle>آزادسازی رزرو</AlertTitle>
      <AlertDescription>
        {reservation
          ? `واریانت ${reservation.variant.sku}${reservation.variant.name ? ` (${reservation.variant.name})` : ''} در انبار «${reservation.warehouse.name}» — ${reservation.quantity} واحد`
          : 'مشخصات رزرو در دسترس نیست.'}
      </AlertDescription>
      <AlertBody>
        <p className="text-sm/6 text-muted">
          رزرو آزاد می‌شود و موجودی قابل عرضه بازیابی خواهد شد.
        </p>
        {error && <ErrorMessage>{error}</ErrorMessage>}
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color="primary" onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting ? 'در حال آزادسازی…' : 'آزادسازی رزرو'}
        </Button>
      </AlertActions>
    </Alert>
  )
}