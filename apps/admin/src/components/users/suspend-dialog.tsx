import { useEffect, useState } from 'react'
import type { AdminUserDetail } from '@sabz/types'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage, Field, Label } from '../catalyst/fieldset'
import { Textarea } from '../catalyst/textarea'
import { Text } from '../catalyst/text'
import { isConflictError, translateApiError } from '../../lib/error-messages'
import { suspendUser } from '../../services/users'

const REASON_MAX = 500

export function SuspendDialog({
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
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setReason('')
      setError(null)
    }
  }, [open])

  const handleSubmit = async (): Promise<void> => {
    if (reason.length > REASON_MAX) {
      setError(`دلیل باید حداکثر ${REASON_MAX} کاراکتر باشد.`)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const updated = await suspendUser(user.id, {
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      })
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
      <AlertTitle>تعلیق کاربر</AlertTitle>
      <AlertDescription>
        با تعلیق {user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.mobile}،
        همه نشست‌های فعال این کاربر لغو می‌شود و دیگر امکان ورود ندارد. این عمل قابل بازگشت است.
      </AlertDescription>
      <AlertBody>
        <div className="space-y-5">
          <Field>
            <Label>دلیل تعلیق (اختیاری)</Label>
            <Textarea
              name="reason"
              value={reason}
              maxLength={REASON_MAX}
              rows={3}
              onChange={(event) => setReason(event.target.value)}
              disabled={submitting}
            />
            <Text className="text-xs text-zinc-500">
              {reason.length}/{REASON_MAX}
            </Text>
          </Field>

          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color="red" onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting ? 'در حال تعلیق…' : 'تعلیق کاربر'}
        </Button>
      </AlertActions>
    </Alert>
  )
}
