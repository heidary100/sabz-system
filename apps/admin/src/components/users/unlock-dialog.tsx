import { useEffect, useState } from 'react'
import type { AdminUserDetail } from '@sabz/types'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage } from '../catalyst/fieldset'
import { isConflictError, translateApiError } from '../../lib/error-messages'
import { unlockUser } from '../../services/users'

export function UnlockDialog({
  open,
  user,
  onClose,
  onSuccess,
  onConflict,
}: {
  open: boolean
  user: AdminUserDetail
  onClose: () => void
  onSuccess: (updated: AdminUserDetail) => void
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
    setSubmitting(true)
    setError(null)
    try {
      const updated = await unlockUser(user.id)
      onSuccess(updated)
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
    <Alert open={open} onClose={onClose} size="md">
      <AlertTitle>باز کردن قفل حساب</AlertTitle>
      <AlertDescription>
        با باز کردن قفل {user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.mobile}،
        وضعیت حساب به «فعال» بازمی‌گردد. نشست‌های قبلی بازگردانده نمی‌شود و کاربر باید دوباره وارد شود.
      </AlertDescription>
      <AlertBody>
        {error && <ErrorMessage>{error}</ErrorMessage>}
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color="primary" onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting ? 'در حال باز کردن…' : 'باز کردن قفل'}
        </Button>
      </AlertActions>
    </Alert>
  )
}
