import { useEffect, useState } from 'react'
import type { AdminUserDetail, AppRole } from '@sabz/types'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage } from '../catalyst/fieldset'
import { translateApiError } from '../../lib/error-messages'
import { ROLE_LABELS } from '../../lib/user-labels'
import { removeRole } from '../../services/users'

export function RoleRemovalDialog({
  open,
  user,
  role,
  onClose,
  onSuccess,
}: {
  open: boolean
  user: AdminUserDetail
  role: AppRole
  onClose: () => void
  onSuccess: (updated: AdminUserDetail) => void
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
      const updated = await removeRole(user.id, role)
      onSuccess(updated)
      onClose()
    } catch (error) {
      setError(translateApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Alert open={open} onClose={onClose} size="md">
      <AlertTitle>حذف نقش</AlertTitle>
      <AlertDescription>
        آیا از حذف نقش «{ROLE_LABELS[role]}» از{' '}
        {user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.mobile} مطمئن
        هستید؟ این عمل قابل بازگشت است.
      </AlertDescription>
      <AlertBody>
        {error && <ErrorMessage>{error}</ErrorMessage>}
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color="red" onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting ? 'در حال حذف…' : 'حذف نقش'}
        </Button>
      </AlertActions>
    </Alert>
  )
}
