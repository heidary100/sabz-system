import { useEffect, useState } from 'react'
import type { WarehouseSummary } from '@sabz/types'
import { Alert, AlertActions, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { isConflictError, translateApiError } from '../../lib/error-messages'
import { activateWarehouse, deactivateWarehouse } from '../../services/warehouses'

export function WarehouseStatusDialog({
  open,
  warehouse,
  mode,
  onClose,
  onSuccess,
  onConflict,
}: {
  open: boolean
  warehouse: WarehouseSummary | null
  mode: 'activate' | 'deactivate'
  onClose: () => void
  onSuccess: () => void
  onConflict: () => void
}) {
  const isDeactivate = mode === 'deactivate'
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setError(null)
    }
  }, [open])

  const handleConfirm = async (): Promise<void> => {
    if (!warehouse) {
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (isDeactivate) {
        await deactivateWarehouse(warehouse.id)
      } else {
        await activateWarehouse(warehouse.id)
      }
      onSuccess()
      onClose()
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
      <AlertTitle>{isDeactivate ? 'غیرفعال‌سازی انبار' : 'فعال‌سازی انبار'}</AlertTitle>
      <AlertDescription>
        {warehouse
          ? isDeactivate
            ? `انبار «${warehouse.name}» غیرفعال می‌شود و دیگر در عملیات انبارداری شرکت نمی‌کند. این عمل قابل بازگشت است.`
            : `انبار «${warehouse.name}» فعال می‌شود و در عملیات انبارداری شرکت می‌کند.`
          : ''}
      </AlertDescription>
      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button
          color={isDeactivate ? 'red' : 'primary'}
          onClick={() => void handleConfirm()}
          disabled={submitting}
        >
          {submitting
            ? isDeactivate
              ? 'در حال غیرفعال‌سازی…'
              : 'در حال فعال‌سازی…'
            : isDeactivate
              ? 'غیرفعال‌سازی'
              : 'فعال‌سازی'}
        </Button>
      </AlertActions>
    </Alert>
  )
}