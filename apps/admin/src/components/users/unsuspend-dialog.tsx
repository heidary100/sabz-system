import { useEffect, useState } from 'react'
import type { AdminUserDetail } from '@sabz/types'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage } from '../catalyst/fieldset'
import { isConflictError, translateApiError } from '../../lib/error-messages'
import { unsuspendUser } from '../../services/users'

export function UnsuspendDialog({
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
      const updated = await unsuspendUser(user.id)
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
      <AlertTitle>رفع تعلیق کاربر</AlertTitle>
      <AlertDescription>
        با رفع تعلیق {user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.mobile}،
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
          {submitting ? 'در حال رفع تعلیق…' : 'رفع تعلیق'}
        </Button>
      </AlertActions>
    </Alert>
  )
}
