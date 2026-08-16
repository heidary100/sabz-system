import { useEffect, useState } from 'react'
import type { AdminPartnerDetail } from '@sabz/types'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage, Field, Label } from '../catalyst/fieldset'
import { Textarea } from '../catalyst/textarea'
import { Text } from '../catalyst/text'
import { translateApiError } from '../../lib/error-messages'
import { rejectPartner } from '../../services/partners'

const REASON_MAX = 500
const REVIEW_NOTES_MAX = 1000

export function RejectDialog({
  open,
  partner,
  onClose,
  onSuccess,
}: {
  open: boolean
  partner: AdminPartnerDetail
  onClose: () => void
  onSuccess: (updated: AdminPartnerDetail) => void
}) {
  const [reason, setReason] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setReason('')
      setReviewNotes('')
      setError(null)
    }
  }, [open])

  const canSubmit = reason.trim().length > 0 && !submitting

  const handleSubmit = async (): Promise<void> => {
    const trimmedReason = reason.trim()
    if (!trimmedReason) {
      setError('وارد کردن دلیل رد الزامی است.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const updated = await rejectPartner(partner.id, {
        reason: trimmedReason,
        ...(reviewNotes.trim() ? { reviewNotes: reviewNotes.trim() } : {}),
      })
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
      <AlertTitle>رد درخواست همکاری</AlertTitle>
      <AlertDescription>
        با رد این درخواست، متقاضی پیام رد و دلیل آن را مشاهده می‌کند. این عمل قابل بازگشت نیست.
      </AlertDescription>
      <AlertBody>
        <div className="space-y-5">
          <Field>
            <Label>دلیل رد (برای متقاضی نمایش داده می‌شود)</Label>
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

          <Field>
            <Label>یادداشت بررسی (داخلی)</Label>
            <Textarea
              name="reviewNotes"
              value={reviewNotes}
              maxLength={REVIEW_NOTES_MAX}
              rows={3}
              onChange={(event) => setReviewNotes(event.target.value)}
              disabled={submitting}
            />
            <Text className="text-xs text-zinc-500">
              {reviewNotes.length}/{REVIEW_NOTES_MAX} — این یادداشت فقط برای بررسی‌کنندگان نمایش
              داده می‌شود.
            </Text>
          </Field>

          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color="red" onClick={() => void handleSubmit()} disabled={!canSubmit}>
          {submitting ? 'در حال رد…' : 'رد درخواست'}
        </Button>
      </AlertActions>
    </Alert>
  )
}