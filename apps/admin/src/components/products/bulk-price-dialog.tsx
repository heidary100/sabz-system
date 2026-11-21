import { useEffect, useMemo, useState } from 'react'
import type {
  BulkPriceApplyResponse,
  BulkPriceOperation,
  BulkPricePreviewResponse,
  PricingScope,
} from '@sabz/types'
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
import { Select } from '../catalyst/select'
import { Text } from '../catalyst/text'
import { JalaliDateTimeInput } from '../ui/jalali-datetime-input'
import { applyBulkPricing, previewBulkPricing } from '../../services/pricing'
import { translateApiError } from '../../lib/error-messages'
import { formatFaNumber, formatRial } from '../../lib/format'
import { groupMoneyDigits } from '../../lib/money-input'

type DiscountKind = 'APPLY_DISCOUNT' | 'CLEAR_DISCOUNT' | 'ADJUST_REGULAR_PRICE'
type OverrideKind = 'SET_OVERRIDE' | 'CLEAR_OVERRIDE'

const MONEY = /^\d{1,10}(?:\.\d{1,2})?$/

/**
 * Contextual bulk pricing dialog (pricing-grid spec §2.2/§2.6).
 * The operator always previews before committing; apply is atomic and
 * token-guarded server-side. The dialog never sends product UUIDs typed by
 * hand — the scope is the selected grid/products/category.
 */
export function BulkPriceDialog({
  open,
  mode,
  scope,
  selectionCount,
  onClose,
  onApplied,
}: {
  open: boolean
  mode: 'discount' | 'override'
  scope: PricingScope
  selectionCount: number
  onClose: () => void
  onApplied: () => void
}) {
  const [discountKind, setDiscountKind] = useState<DiscountKind>('APPLY_DISCOUNT')
  const [discountMode, setDiscountMode] = useState<'FIXED' | 'PERCENT'>('PERCENT')
  const [discountValue, setDiscountValue] = useState('10')
  const [direction, setDirection] = useState<'INCREASE' | 'DECREASE'>('DECREASE')
  const [overrideKind, setOverrideKind] = useState<OverrideKind>('SET_OVERRIDE')
  const [overrideMode, setOverrideMode] = useState<'ABSOLUTE' | 'PERCENT' | 'FIXED'>('ABSOLUTE')
  const [overrideValue, setOverrideValue] = useState('')
  const [startsAt, setStartsAt] = useState<string | null>(null)
  const [endsAt, setEndsAt] = useState<string | null>(null)
  const [preview, setPreview] = useState<BulkPricePreviewResponse | null>(null)
  const [result, setResult] = useState<BulkPriceApplyResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setDiscountKind('APPLY_DISCOUNT')
    setDiscountMode('PERCENT')
    setDiscountValue('10')
    setDirection('DECREASE')
    setOverrideKind('SET_OVERRIDE')
    setOverrideMode('ABSOLUTE')
    setOverrideValue('')
    setStartsAt(null)
    setEndsAt(null)
    setPreview(null)
    setResult(null)
    setError(null)
    setBusy(false)
  }, [open, mode])

  const operation = useMemo<BulkPriceOperation | null>(() => {
    if (mode === 'discount') {
      if (discountKind === 'CLEAR_DISCOUNT') {
        return { kind: 'CLEAR_DISCOUNT' }
      }
      if (discountKind === 'ADJUST_REGULAR_PRICE') {
        return {
          kind: 'ADJUST_REGULAR_PRICE',
          mode: 'PERCENT',
          direction,
          value: discountValue,
        }
      }
      return { kind: 'APPLY_DISCOUNT', mode: discountMode, value: discountValue }
    }
    if (overrideKind === 'CLEAR_OVERRIDE') {
      return { kind: 'CLEAR_OVERRIDE' }
    }
    return {
      kind: 'SET_OVERRIDE',
      ...(overrideMode === 'ABSOLUTE'
        ? { overridePrice: overrideValue }
        : { type: overrideMode, value: overrideValue }),
      startsAt,
      endsAt,
    }
  }, [
    mode,
    discountKind,
    discountMode,
    discountValue,
    direction,
    overrideKind,
    overrideMode,
    overrideValue,
    startsAt,
    endsAt,
  ])

  function validateLocally(): string | null {
    if (selectionCount === 0) return 'حداقل یک محصول انتخاب کنید.'
    if (!operation) return 'عملیات معتبر نیست.'
    if (operation.kind === 'APPLY_DISCOUNT') {
      if (!MONEY.test(operation.value) || Number(operation.value) <= 0) {
        return 'مبلغ/درصد تخفیف باید عددی بزرگ‌تر از صفر باشد.'
      }
      if (operation.mode === 'PERCENT' && Number(operation.value) >= 100) {
        return 'درصد تخفیف باید کمتر از ۱۰۰ باشد.'
      }
    }
    if (operation.kind === 'ADJUST_REGULAR_PRICE') {
      if (!MONEY.test(operation.value) || Number(operation.value) <= 0) {
        return 'درصد تغییر قیمت باید عددی بزرگ‌تر از صفر باشد.'
      }
      if (Number(operation.value) >= 100) {
        return 'درصد کاهش باید کمتر از ۱۰۰ باشد.'
      }
    }
    if (operation.kind === 'SET_OVERRIDE') {
      if ('overridePrice' in operation) {
        if (!operation.overridePrice || !MONEY.test(operation.overridePrice)) {
          return 'قیمت اورراید را به ریال وارد کنید.'
        }
      } else if (!operation.value || !MONEY.test(operation.value)) {
        return 'مقدار اورراید را وارد کنید.'
      }
    }
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      return 'پایان بازه باید بعد از شروع آن باشد.'
    }
    return null
  }

  async function runPreview(): Promise<void> {
    const localError = validateLocally()
    if (localError) {
      setError(localError)
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setPreview(await previewBulkPricing({ scope, operation: operation! }))
    } catch (caught) {
      setPreview(null)
      setError(translateApiError(caught))
    } finally {
      setBusy(false)
    }
  }

  async function runApply(): Promise<void> {
    if (!preview || !operation) return
    setBusy(true)
    setError(null)
    try {
      const applied = await applyBulkPricing({
        scope,
        operation,
        previewToken: preview.previewToken,
      })
      setResult(applied)
      if (applied.applied) {
        onApplied()
      }
    } catch (caught) {
      setError(translateApiError(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Alert open={open} onClose={onClose} size="lg">
      <AlertTitle>
        {mode === 'discount' ? 'تخفیف گروهی انتخاب‌شده‌ها' : 'اورراید قیمت انتخاب‌شده‌ها'}
      </AlertTitle>
      <AlertDescription>
        {formatFaNumber(selectionCount)} محصول انتخاب شده است. پیش‌نمایش، قیمت قبل و بعد،
        ردیف‌های ردشده و خطاها را قبل از ثبت نشان می‌دهد.
      </AlertDescription>
      <AlertBody>
        <div className="space-y-5">
          {mode === 'discount' ? (
            <>
              <Field>
                <Label>نوع عملیات</Label>
                <Select
                  value={discountKind}
                  onChange={(event) => {
                    setDiscountKind(event.target.value as DiscountKind)
                    setPreview(null)
                  }}
                >
                  <option value="APPLY_DISCOUNT">اعمال تخفیف فروش ویژه</option>
                  <option value="CLEAR_DISCOUNT">پاک کردن تخفیف</option>
                  <option value="ADJUST_REGULAR_PRICE">
                    تغییر درصدی قیمت عادی (نه تخفیف)
                  </option>
                </Select>
              </Field>
              {discountKind === 'APPLY_DISCOUNT' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <Label>روش تخفیف</Label>
                    <Select
                      value={discountMode}
                      onChange={(event) => {
                        setDiscountMode(event.target.value as 'FIXED' | 'PERCENT')
                        setPreview(null)
                      }}
                    >
                      <option value="PERCENT">درصدی از قیمت عادی</option>
                      <option value="FIXED">مبلغ ثابت ریالی برای هر نوع</option>
                    </Select>
                  </Field>
                  <Field>
                    <Label>
                      {discountMode === 'PERCENT' ? 'درصد تخفیف' : 'مبلغ تخفیف (ریال)'}
                    </Label>
                    <Input
                      dir="ltr"
                      inputMode="decimal"
                      value={
                        discountMode === 'FIXED'
                          ? groupMoneyDigits(discountValue)
                          : discountValue
                      }
                      onChange={(event) =>
                        setDiscountValue(
                          discountMode === 'FIXED'
                            ? event.target.value.replace(/[^\d.]/g, '')
                            : event.target.value,
                        )
                      }
                    />
                  </Field>
                </div>
              )}
              {discountKind === 'ADJUST_REGULAR_PRICE' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <Label>جهت تغییر</Label>
                    <Select
                      value={direction}
                      onChange={(event) =>
                        setDirection(event.target.value as 'INCREASE' | 'DECREASE')
                      }
                    >
                      <option value="DECREASE">کاهش قیمت عادی</option>
                      <option value="INCREASE">افزایش قیمت عادی</option>
                    </Select>
                  </Field>
                  <Field>
                    <Label>درصد تغییر</Label>
                    <Input
                      dir="ltr"
                      inputMode="decimal"
                      value={discountValue}
                      onChange={(event) => setDiscountValue(event.target.value)}
                    />
                  </Field>
                </div>
              )}
            </>
          ) : (
            <>
              <Field>
                <Label>نوع اورراید</Label>
                <Select
                  value={overrideKind}
                  onChange={(event) => {
                    setOverrideKind(event.target.value as OverrideKind)
                    setPreview(null)
                  }}
                >
                  <option value="SET_OVERRIDE">ثبت/ویرایش اورراید</option>
                  <option value="CLEAR_OVERRIDE">پاک کردن اورراید</option>
                </Select>
              </Field>
              {overrideKind === 'SET_OVERRIDE' && (
                <>
                  <Field>
                    <Label>شکل اورراید</Label>
                    <Select
                      value={overrideMode}
                      onChange={(event) => {
                        setOverrideMode(event.target.value as typeof overrideMode)
                        setPreview(null)
                      }}
                    >
                      <option value="ABSOLUTE">قیمت نهایی مطلق (ریال)</option>
                      <option value="PERCENT">درصد تخفیف از قیمت جاری</option>
                      <option value="FIXED">مبلغ ثابت تخفیف (ریال)</option>
                    </Select>
                  </Field>
                  <Field>
                    <Label>
                      {overrideMode === 'PERCENT' ? 'درصد' : 'مبلغ (ریال)'}
                    </Label>
                    <Input
                      dir="ltr"
                      inputMode="decimal"
                      value={
                        overrideMode === 'PERCENT'
                          ? overrideValue
                          : groupMoneyDigits(overrideValue)
                      }
                      onChange={(event) =>
                        setOverrideValue(
                          overrideMode === 'PERCENT'
                            ? event.target.value
                            : event.target.value.replace(/[^\d.]/g, ''),
                        )
                      }
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <Label>شروع (اختیاری)</Label>
                      <JalaliDateTimeInput
                        businessTimeZone
                        id="bulk-override-start"
                        value={startsAt}
                        onChange={setStartsAt}
                        withTime
                        ariaLabel="شروع اورراید"
                      />
                    </Field>
                    <Field>
                      <Label>پایان (اختیاری)</Label>
                      <JalaliDateTimeInput
                        businessTimeZone
                        id="bulk-override-end"
                        value={endsAt}
                        onChange={setEndsAt}
                        withTime
                        ariaLabel="پایان اورراید"
                      />
                    </Field>
                  </div>
                </>
              )}
            </>
          )}

          <Text className="text-xs text-muted">
            اولویت: قیمت فروش ویژه فعال &gt; اورراید مطلق &gt; قانون دسته‌بندی &gt; قیمت عادی؛
            قیمت همکار برای همکار تأییدشده جایگزین قوانین خرده‌فروشی می‌شود و با پله همکاری
            دوباره اعمال نمی‌شود. عملیات گروهی اتمیک است؛ اگر یک ردیف خطا داشته باشد هیچ
            ردیفی ثبت نمی‌شود.
          </Text>

          {error && <ErrorMessage>{error}</ErrorMessage>}

          {preview && (
            <div className="space-y-3 rounded-lg border border-border p-3" role="status">
              <div className="flex flex-wrap gap-4 text-sm">
                <span>کل: {formatFaNumber(preview.total)}</span>
                <span className="text-primary">قابل اعمال: {formatFaNumber(preview.affected)}</span>
                <span className="text-muted">ردشده: {formatFaNumber(preview.skipped)}</span>
                <span className="text-red-600">خطا: {formatFaNumber(preview.failed)}</span>
              </div>
              {preview.warnings.length > 0 && (
                <ul className="list-inside list-disc text-xs text-amber-700">
                  {preview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
              <div className="max-h-64 overflow-auto rounded border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-surface-strong text-start">
                    <tr>
                      <th className="p-1.5 text-start">SKU</th>
                      <th className="p-1.5 text-start">قیمت عادی</th>
                      <th className="p-1.5 text-start">فروش ویژه</th>
                      <th className="p-1.5 text-start">مؤثر</th>
                      <th className="p-1.5 text-start">نتیجه</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 50).map((row) => (
                      <tr key={row.variantId} className="border-t border-border">
                        <td className="p-1.5 font-mono" dir="ltr">{row.sku}</td>
                        <td className="p-1.5" dir="ltr">{formatRial(row.regularPriceBefore)}</td>
                        <td className="p-1.5" dir="ltr">
                          {row.discountedPriceAfter ? formatRial(row.discountedPriceAfter) : '—'}
                        </td>
                        <td className="p-1.5" dir="ltr">
                          {row.effectivePriceAfter ? formatRial(row.effectivePriceAfter) : '—'}
                        </td>
                        <td className="p-1.5">
                          {row.outcome === 'AFFECTED'
                            ? 'اعمال می‌شود'
                            : row.reason ?? row.outcome}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && (
            <div
              className={
                result.applied
                  ? 'rounded-control bg-success/10 px-3 py-2 text-sm text-success'
                  : 'rounded-control bg-red-600/10 px-3 py-2 text-sm text-red-700'
              }
              role="status"
            >
              {result.applied
                ? `${formatFaNumber(result.summary.affected)} ردیف با موفقیت ثبت شد؛ ${formatFaNumber(result.summary.skipped)} ردیف رد شد.`
                : `ثبت انجام نشد؛ ${formatFaNumber(result.summary.failed)} ردیف خطا دارد.`}
            </div>
          )}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={busy}>
          بستن
        </Button>
        <Button outline onClick={() => void runPreview()} disabled={busy}>
          {busy ? 'در حال بررسی…' : 'پیش‌نمایش'}
        </Button>
        <Button
          color="primary"
          onClick={() => void runApply()}
          disabled={busy || !preview || preview.failed > 0 || preview.affected === 0}
        >
          تأیید و ثبت
        </Button>
      </AlertActions>
    </Alert>
  )
}
