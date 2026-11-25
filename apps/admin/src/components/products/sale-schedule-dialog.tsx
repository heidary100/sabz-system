import { useEffect, useState } from 'react'
import type { CatalogGridRow } from '@sabz/types'
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage, Field, Label } from '../catalyst/fieldset'
import { Text } from '../catalyst/text'
import { JalaliDateTimeInput } from '../ui/jalali-datetime-input'
import { batchUpdateCatalogGrid } from '../../services/catalog-grid'
import { translateApiError } from '../../lib/error-messages'

/**
 * Row-level sale-window editor (pricing-grid spec §2.5). The sale price itself
 * is edited inline; this dialog only controls when that price is effective.
 * Both bounds are optional; the server enforces start < end and the
 * discounted-price invariant on the effective row.
 */
export function SaleScheduleDialog({
  row,
  onClose,
  onSaved,
}: {
  row: CatalogGridRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [startsAt, setStartsAt] = useState<string | null>(null)
  const [endsAt, setEndsAt] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (row) {
      setStartsAt(row.discountStartsAt)
      setEndsAt(row.discountEndsAt)
      setError(null)
      setSaving(false)
    }
  }, [row])

  async function save(): Promise<void> {
    if (!row) return
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      setError('پایان بازه باید بعد از شروع آن باشد.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await batchUpdateCatalogGrid({
        rows: [
          {
            variantId: row.variantId,
            expectedUpdatedAt: row.expectedUpdatedAt,
            discountStartsAt: startsAt,
            discountEndsAt: endsAt,
          },
        ],
      })
      const outcome = response.results[0]
      if (!outcome || outcome.outcome !== 'SUCCESS') {
        setError(outcome?.message ?? 'ذخیره بازه زمانی انجام نشد.')
        return
      }
      onSaved()
    } catch (caught) {
      setError(translateApiError(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Alert open={row !== null} onClose={onClose} size="md">
      <AlertTitle>زمان‌بندی فروش ویژه</AlertTitle>
      <AlertDescription>
        {row ? `${row.productName} — ${row.sku}` : ''}؛ اگر قیمت فروش ویژه خالی باشد،
        بازه زمانی به‌تنهایی قیمتی را تغییر نمی‌دهد.
      </AlertDescription>
      <AlertBody>
        <div className="space-y-4">
          <Field>
            <Label>شروع نمایش فروش ویژه (اختیاری)</Label>
            <JalaliDateTimeInput
              businessTimeZone
              id="sale-start"
              value={startsAt}
              onChange={setStartsAt}
              withTime
              ariaLabel="شروع فروش ویژه"
              disabled={saving}
            />
          </Field>
          <Field>
            <Label>پایان نمایش فروش ویژه (اختیاری)</Label>
            <JalaliDateTimeInput
              businessTimeZone
              id="sale-end"
              value={endsAt}
              onChange={setEndsAt}
              withTime
              ariaLabel="پایان فروش ویژه"
              disabled={saving}
            />
          </Field>
          <Text className="text-xs text-muted">
            خارج از این بازه، قیمت عادی به مشتری نمایش داده و محاسبه می‌شود. هر دو زمان
            به وقت تهران تفسیر می‌شوند و در سرور به UTC ذخیره می‌شوند.
          </Text>
          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={saving}>
          انصراف
        </Button>
        <Button color="primary" onClick={() => void save()} disabled={saving}>
          {saving ? 'در حال ذخیره…' : 'ذخیره بازه'}
        </Button>
      </AlertActions>
    </Alert>
  )
}
