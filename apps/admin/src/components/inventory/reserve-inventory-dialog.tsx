import { useEffect, useState } from 'react'
import { BookmarkPlus } from 'lucide-react'
import type { InventoryVariantRef, WarehouseSummary } from '@sabz/types'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage, Field, Label } from '../catalyst/fieldset'
import { Input } from '../catalyst/input'
import { Text } from '../catalyst/text'
import { isConflictError, translateApiError } from '../../lib/error-messages'
import { reserveInventory } from '../../services/inventory'

const EXPIRY_MAX_HOURS = 87_600

export function ReserveInventoryDialog({
  open,
  variant,
  warehouse,
  available,
  onClose,
  onSuccess,
  onConflict,
}: {
  open: boolean
  variant: InventoryVariantRef | null
  warehouse: WarehouseSummary | null
  available: number | null
  onClose: () => void
  onSuccess: () => void
  onConflict: () => void
}) {
  const [quantity, setQuantity] = useState('')
  const [hasExpiry, setHasExpiry] = useState(false)
  const [expiryHours, setExpiryHours] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setQuantity('')
      setHasExpiry(false)
      setExpiryHours('')
      setError(null)
    }
  }, [open])

  const parsedQuantity = Number(quantity)
  const invalidQuantity =
    quantity.trim() === '' || !Number.isInteger(parsedQuantity) || parsedQuantity < 1

  const parsedHours = Number(expiryHours)
  const invalidExpiry =
    hasExpiry &&
    (expiryHours.trim() === '' ||
      !Number.isInteger(parsedHours) ||
      parsedHours < 1 ||
      parsedHours > EXPIRY_MAX_HOURS)

  const canSubmit =
    !invalidQuantity &&
    !invalidExpiry &&
    !submitting &&
    variant !== null &&
    warehouse !== null

  const handleSubmit = async (): Promise<void> => {
    if (!variant || !warehouse) {
      return
    }
    if (invalidQuantity) {
      setError('مقدار رزرو باید عدد صحیح بزرگتر از صفر باشد.')
      return
    }
    if (invalidExpiry) {
      setError(`ساعت انقضا باید عدد صحیح بین ۱ و ${EXPIRY_MAX_HOURS} باشد.`)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await reserveInventory({
        variantId: variant.id,
        warehouseId: warehouse.id,
        quantity: parsedQuantity,
        ...(hasExpiry ? { expiresIn: parsedHours * 3600 } : {}),
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
      <AlertTitle>رزرو موجودی</AlertTitle>
      <AlertDescription>
        {variant && warehouse
          ? `واریانت ${variant.sku}${variant.name ? ` (${variant.name})` : ''} در انبار «${warehouse.name}»`
          : 'مشخصات واریانت یا انبار در دسترس نیست.'}
      </AlertDescription>
      <AlertBody>
        <div className="space-y-5">
          <Field>
            <Label>مقدار رزرو</Label>
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
            <Text className="text-xs text-muted">
              {available !== null
                ? `قابل عرضه فعلی: ${available} — این مقدار هنگام ثبت مجدداً از سمت سرور بررسی میشود.`
                : 'مقدار قابل عرضه در دسترس نیست.'}
            </Text>
          </Field>

          <Field>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                name="hasExpiry"
                checked={hasExpiry}
                onChange={(event) => setHasExpiry(event.target.checked)}
                disabled={submitting}
              />
              <Label>دارای تاریخ انقضا</Label>
            </div>
            {hasExpiry && (
              <Input
                name="expiryHours"
                type="number"
                dir="ltr"
                min={1}
                max={EXPIRY_MAX_HOURS}
                step={1}
                placeholder="ساعت"
                value={expiryHours}
                onChange={(event) => setExpiryHours(event.target.value)}
                disabled={submitting}
              />
            )}
            <Text className="text-xs text-muted">
              بدون انقضا یعنی رزرو هرگز به‌صورت خودکار بسته نمی‌شود.
            </Text>
          </Field>

          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
          <BookmarkPlus data-slot="icon" />
          {submitting ? 'در حال ثبت…' : 'ثبت رزرو'}
        </Button>
      </AlertActions>
    </Alert>
  )
}