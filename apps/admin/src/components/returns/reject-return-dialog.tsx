import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage, Field, Label } from '../catalyst/fieldset'
import { Textarea } from '../catalyst/textarea'
import { translateApiError } from '../../lib/error-messages'

function validateReason(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    return 'دلیل رد الزامی است.'
  }
  if (trimmed.length > 1000) {
    return 'دلیل رد باید حداکثر ۱۰۰۰ کاراکتر باشد.'
  }
  return null
}

/**
 * Rejection dialog with a required reason field (SS-242). The shared
 * `DeleteConfirmDialog` carries no inputs, while `POST
 * /admin/returns/:id/reject` requires a reason — so this sibling dialog
 * pairs the same Alert shell with a validated Textarea.
 */
export function RejectReturnDialog({
  open,
  title,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setReason('')
      setFieldError(null)
      setSubmitError(null)
      setSubmitting(false)
    }
  }, [open])

  const handleConfirm = async (): Promise<void> => {
    const validationError = validateReason(reason)
    if (validationError) {
      setFieldError(validationError)
      return
    }
    setFieldError(null)
    setSubmitError(null)
    setSubmitting(true)
    try {
      await onConfirm(reason.trim())
      onClose()
    } catch (error) {
      setSubmitError(translateApiError(error))
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
        <AlertDescription>
          این درخواست مرجوعی رد می‌شود و بسته خواهد شد. این عمل قابل بازگشت
          نیست.
        </AlertDescription>
        <Field className="mt-4 text-start">
          <Label>دلیل رد</Label>
          <Textarea
            name="rejectReason"
            rows={3}
            value={reason}
            disabled={submitting}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        {fieldError && <ErrorMessage>{fieldError}</ErrorMessage>}
        {submitError && (
          <p className="mt-4 danger-box rounded-lg px-3 py-2 text-sm">
            {submitError}
          </p>
        )}
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button
          color="red"
          onClick={() => void handleConfirm()}
          disabled={submitting}
        >
          {submitting ? 'در حال رد…' : 'رد درخواست'}
        </Button>
      </AlertActions>
    </Alert>
  )
}
