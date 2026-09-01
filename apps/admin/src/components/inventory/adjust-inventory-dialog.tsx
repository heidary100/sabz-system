import { useEffect, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import type { InventoryVariantRef, WarehouseSummary } from '@sabz/types'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage, Field, Label } from '../catalyst/fieldset'
import { Input } from '../catalyst/input'
import { Text } from '../catalyst/text'
import { Textarea } from '../catalyst/textarea'
import { isConflictError, translateApiError } from '../../lib/error-messages'
import { adjustInventory } from '../../services/inventory'

const REASON_MAX = 500
const NOTES_MAX = 1000

export function AdjustInventoryDialog({
  open,
  variant,
  warehouse,
  currentQuantity,
  onClose,
  onSuccess,
  onConflict,
}: {
  open: boolean
  variant: InventoryVariantRef | null
  warehouse: WarehouseSummary | null
  currentQuantity: number | null
  onClose: () => void
  onSuccess: () => void
  onConflict: () => void
}) {
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setQuantity('')
      setReason('')
      setNotes('')
      setError(null)
    }
  }, [open])

  const parsed = Number(quantity)
  const invalidQuantity =
    quantity.trim() === '' || !Number.isInteger(parsed) || parsed < 0
  const invalidReason = reason.trim() === ''
  const canSubmit =
    !invalidQuantity &&
    !invalidReason &&
    reason.length <= REASON_MAX &&
    notes.length <= NOTES_MAX &&
    !submitting &&
    variant !== null &&
    warehouse !== null

  const handleSubmit = async (): Promise<void> => {
    if (!variant || !warehouse) {
      return
    }
    if (invalidQuantity) {
      setError('موجودی جدید باید عدد صحیح و غیرمنفی باشد.')
      return
    }
    if (invalidReason) {
      setError('دلیل اصلاح الزامی است.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await adjustInventory({
        variantId: variant.id,
        warehouseId: warehouse.id,
        quantity: parsed,
        reason: reason.trim(),
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
      <AlertTitle>اصلاح موجودی</AlertTitle>
      <AlertDescription>
        {variant && warehouse
          ? `واریانت ${variant.sku}${variant.name ? ` (${variant.name})` : ''} در انبار «${warehouse.name}»`
          : 'مشخصات واریانت یا انبار در دسترس نیست.'}
      </AlertDescription>
      <AlertBody>
        <div className="space-y-5">
          <Text className="text-sm text-muted">
            موجودی فعلی:{' '}
            <span dir="ltr" className="font-medium">
              {currentQuantity ?? '—'}
            </span>
          </Text>

          <Field>
            <Label>موجودی جدید</Label>
            <Input
              name="quantity"
              type="number"
              dir="ltr"
              min={0}
              step={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              disabled={submitting}
            />
            <Text className="text-xs text-muted">
              این مقدار به صورت مطلق جایگزین موجودی فعلی میشود؛ تغییر افزایشی نیست و مقدار منفی مجاز نیست.
            </Text>
          </Field>

          <Field>
            <Label>دلیل اصلاح</Label>
            <Input
              name="reason"
              value={reason}
              maxLength={REASON_MAX}
              onChange={(event) => setReason(event.target.value)}
              disabled={submitting}
              placeholder="مثلاً تطبیق شمارش فیزیکی"
            />
            <Text className="text-xs text-muted">{reason.length}/{REASON_MAX}</Text>
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
            <Text className="text-xs text-muted">{notes.length}/{NOTES_MAX}</Text>
          </Field>

          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
          <SlidersHorizontal data-slot="icon" />
          {submitting ? 'در حال ثبت…' : 'ثبت اصلاح'}
        </Button>
      </AlertActions>
    </Alert>
  )
}