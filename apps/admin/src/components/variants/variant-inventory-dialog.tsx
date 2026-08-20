import { useEffect, useState } from 'react'
import type { VariantSummary } from '@sabz/types'
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage, Field, Label } from '../catalyst/fieldset'
import { Input } from '../catalyst/input'
import { Text } from '../catalyst/text'
import { translateApiError, isConflictError } from '../../lib/error-messages'
import { setVariantInventory } from '../../services/variants'

export function VariantInventoryDialog({
  open,
  variant,
  onClose,
  onSuccess,
  onConflict,
}: {
  open: boolean
  variant: VariantSummary | null
  onClose: () => void
  onSuccess: () => void
  onConflict: () => void
}) {
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && variant) {
      setValue(String(variant.stockQuantity))
      setError(null)
    }
  }, [open, variant])

  const parsed = Number(value)
  const invalid = value.trim() === '' || !Number.isInteger(parsed) || parsed < 0
  const canSubmit = !invalid && !submitting

  const handleSubmit = async (): Promise<void> => {
    if (invalid) {
      setError('موجودی باید عدد صحیح و غیرمنفی باشد.')
      return
    }
    if (!variant) {
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await setVariantInventory(variant.id, { stockQuantity: parsed })
      onSuccess()
    } catch (error) {
      if (isConflictError(error)) {
        onConflict()
      }
      setError(translateApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Alert open={open} onClose={onClose} size="sm">
      <AlertTitle>تنظیم موجودی واریانت</AlertTitle>
      <AlertDescription>
        موجودی فعلی: <span dir="ltr" className="font-medium">{variant?.stockQuantity ?? '—'}</span>
      </AlertDescription>
      <AlertBody>
        <Field>
          <Label>موجودی</Label>
          <Input
            name="stockQuantity"
            type="number"
            dir="ltr"
            min={0}
            step={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={submitting}
          />
          <Text className="text-xs text-zinc-500">
            این مقدار بهصورت مطلق جایگزین موجودی فعلی میشود (نمای کلی M1) و به انبار / رزرو مربوط نمیشود.
          </Text>
        </Field>
        {error && (
          <div className="mt-3">
            <ErrorMessage>{error}</ErrorMessage>
          </div>
        )}
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
          {submitting ? 'در حال ذخیره…' : 'ثبت موجودی'}
        </Button>
      </AlertActions>
    </Alert>
  )
}