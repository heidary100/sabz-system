import { useEffect, useState } from 'react'
import type { InventoryVariantRef, WarehouseSummary } from '@sabz/types'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage, Field, Label } from '../catalyst/fieldset'
import { Input } from '../catalyst/input'
import { Text } from '../catalyst/text'
import { Textarea } from '../catalyst/textarea'
import { isConflictError, translateApiError } from '../../lib/error-messages'
import { receiveInventory } from '../../services/inventory'

const NOTES_MAX = 1000

export function ReceiveStockDialog({
  open,
  variant,
  warehouse,
  onClose,
  onSuccess,
  onConflict,
}: {
  open: boolean
  variant: InventoryVariantRef | null
  warehouse: WarehouseSummary | null
  onClose: () => void
  onSuccess: () => void
  onConflict: () => void
}) {
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setQuantity('')
      setNotes('')
      setError(null)
    }
  }, [open])

  const parsed = Number(quantity)
  const invalidQuantity =
    quantity.trim() === '' || !Number.isInteger(parsed) || parsed < 1
  const canSubmit =
    !invalidQuantity && notes.length <= NOTES_MAX && !submitting && variant !== null && warehouse !== null

  const handleSubmit = async (): Promise<void> => {
    if (!variant || !warehouse) {
      return
    }
    if (invalidQuantity) {
      setError('مقدار دریافت باید عدد صحیح بزرگتر از صفر باشد.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await receiveInventory({
        variantId: variant.id,
        warehouseId: warehouse.id,
        quantity: parsed,
        notes: notes.trim() || undefined,
      })
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
      <AlertTitle>دریافت موجودی</AlertTitle>
      <AlertDescription>
        {variant && warehouse
          ? `واریانت ${variant.sku}${variant.name ? ` (${variant.name})` : ''} در انبار «${warehouse.name}»`
          : 'مشخصات واریانت یا انبار در دسترس نیست.'}
      </AlertDescription>
      <AlertBody>
        <div className="space-y-5">
          <Field>
            <Label>مقدار دریافت</Label>
            <Input
              name="quantity"
              type="number"
              dir="ltr"
              min={1}
              step={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              disabled={submitting}
            />
            <Text className="text-xs text-zinc-500">
              این مقدار به موجودی فعلی اضافه میشود.
            </Text>
          </Field>

          <Field>
            <Label>یادداشت (اختیاری)</Label>
            <Textarea
              name="notes"
              value={notes}
              maxLength={NOTES_MAX}
              rows={3}
              onChange={(event) => setNotes(event.target.value)}
              disabled={submitting}
            />
            <Text className="text-xs text-zinc-500">{notes.length}/{NOTES_MAX}</Text>
          </Field>

          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
          {submitting ? 'در حال ثبت…' : 'ثبت دریافت'}
        </Button>
      </AlertActions>
    </Alert>
  )
}