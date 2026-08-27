import { useEffect, useState } from 'react'
import type { ReservationSummary } from '@sabz/types'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage } from '../catalyst/fieldset'
import { isConflictError, translateApiError } from '../../lib/error-messages'
import { consumeReservation } from '../../services/inventory'

export function ConsumeReservationDialog({
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
      await consumeReservation(reservation.id)
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
      <AlertTitle>مصرف رزرو</AlertTitle>
      <AlertDescription>
        {reservation
          ? `واریانت ${reservation.variant.sku}${reservation.variant.name ? ` (${reservation.variant.name})` : ''} در انبار «${reservation.warehouse.name}» — ${reservation.quantity} واحد`
          : 'مشخصات رزرو در دسترس نیست.'}
      </AlertDescription>
      <AlertBody>
        <p className="text-sm/6 text-zinc-500">
          مصرف رزرو یک عملیات قطعی است؛ مقدار از موجودی در دست کسر می‌شود و امکان بازگردانی ندارد.
          در M1 این عملیات سفارشی ایجاد نمی‌کند.
        </p>
        {error && <ErrorMessage>{error}</ErrorMessage>}
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color="red" onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting ? 'در حال مصرف…' : 'مصرف رزرو'}
        </Button>
      </AlertActions>
    </Alert>
  )
}