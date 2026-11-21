import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { VariantSummary } from '@sabz/types'
import { RefreshCw } from 'lucide-react'
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
import { translateApiError, isConflictError } from '../../lib/error-messages'
import { foldDigitsToEnglish } from '../../lib/digits'
import {
  applyMoneyInput,
  groupMoneyDigits,
  restoreMoneyCaret,
} from '../../lib/money-input'
import { suggestSku } from '../../lib/sku-suggestion'
import { createVariant, updateVariant } from '../../services/variants'

const PRICE_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/

const SKU_MAX = 64
const BARCODE_MAX = 64
const NAME_MAX = 255

type PriceSourceCurrency = 'RIAL' | 'USD' | 'AED'

const CURRENCY_LABELS: Record<PriceSourceCurrency, string> = {
  RIAL: 'ریال',
  USD: 'دلار آمریکا',
  AED: 'درهم امارات',
}

const PRICE_STATUS_LABELS: Record<'PRICED' | 'CALL_FOR_PRICE', string> = {
  PRICED: 'قیمت‌دار (قابل خرید)',
  CALL_FOR_PRICE: 'تماس بگیرید (بدون قیمت)',
}

interface VariantFormValue {
  sku: string
  barcode: string
  name: string
  price: string
  discountedPrice: string
  discountStartsAt: string
  discountEndsAt: string
  partnerPrice: string
  priceSourceCurrency: PriceSourceCurrency
  priceStatus: 'PRICED' | 'CALL_FOR_PRICE'
}

const EMPTY: VariantFormValue = {
  sku: '',
  barcode: '',
  name: '',
  price: '',
  discountedPrice: '',
  discountStartsAt: '',
  discountEndsAt: '',
  partnerPrice: '',
  priceSourceCurrency: 'RIAL',
  priceStatus: 'PRICED',
}

function fromVariant(variant: VariantSummary): VariantFormValue {
  return {
    sku: variant.sku,
    barcode: variant.barcode ?? '',
    name: variant.name ?? '',
    price: variant.priceSourceAmount ?? variant.price,
    discountedPrice:
      variant.discountSourceAmount ?? variant.discountedPrice ?? '',
    discountStartsAt: variant.discountStartsAt ?? '',
    discountEndsAt: variant.discountEndsAt ?? '',
    partnerPrice: variant.partnerPrice ?? '',
    priceSourceCurrency: variant.priceSourceCurrency ?? 'RIAL',
    priceStatus: variant.priceStatus,
  }
}

export function VariantForm({
  open,
  productId,
  variant,
  onClose,
  onSuccess,
  onConflict,
}: {
  open: boolean
  productId: string
  variant: VariantSummary | null
  onClose: () => void
  onSuccess: () => void
  onConflict: () => void
}) {
  const isEdit = variant !== null

  const [values, setValues] = useState<VariantFormValue>(EMPTY)
  const [skuTouched, setSkuTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      // SS-256: create mode opens with an editable suggestion. The value is
      // name-independent, so no later field change can regenerate it.
      setValues(variant ? fromVariant(variant) : { ...EMPTY, sku: suggestSku() })
      setSkuTouched(false)
      setError(null)
    }
  }, [open, variant])

  const set = (key: keyof VariantFormValue, value: string): void => {
    // SS-250: money inputs fold Persian/Arabic digits before validation —
    // ۱۵۰۰ must validate like 1500, not die in a pattern error.
    const normalized =
      key === 'price' || key === 'discountedPrice' || key === 'partnerPrice'
        ? foldDigitsToEnglish(value)
        : value
    if (key === 'sku') {
      setSkuTouched(true)
    }
    setValues((prev) => ({ ...prev, [key]: normalized }))
  }

  // SS-265: money state stays canonical (raw, what gets submitted); the
  // input shows thousands grouping. set() still folds digits (SS-250).
  const setMoney = (
    key: 'price' | 'discountedPrice' | 'partnerPrice',
    event: ChangeEvent<HTMLInputElement>,
  ): void => {
    const next = applyMoneyInput(event.target.value, event.target.selectionStart ?? 0)
    restoreMoneyCaret(event.target, next.caret)
    set(key, next.state)
  }

  // SS-256: the suggestion is only ever replaced while the field is untouched
  // or empty — a manual edit can never be discarded by regenerate.
  const canRegenerate = !isEdit && (!skuTouched || values.sku.trim() === '')
  const regenerateSuggestion = (): void => {
    setValues((prev) => ({ ...prev, sku: suggestSku() }))
  }

  const priceValid = PRICE_PATTERN.test(values.price.trim())
  const discountedValid =
    values.discountedPrice.trim() === '' ||
    PRICE_PATTERN.test(values.discountedPrice.trim())
  const partnerValid =
    values.partnerPrice.trim() === '' ||
    PRICE_PATTERN.test(values.partnerPrice.trim())

  const canSubmit =
    values.sku.trim().length > 0 && priceValid && discountedValid && partnerValid && !submitting

  const handleSubmit = async (): Promise<void> => {
    if (!values.sku.trim()) {
      setError('SKU الزامی است.')
      return
    }
    if (!priceValid) {
      setError('قیمت باید عدد اعشاری معتبر با حداکثر ۲ رقم اعشار باشد.')
      return
    }
    if (!discountedValid) {
      setError('قیمت فروش ویژه باید عدد اعشاری معتبر با حداکثر ۲ رقم اعشار باشد.')
      return
    }
    if (!partnerValid) {
      setError('قیمت همکار باید عدد اعشاری معتبر با حداکثر ۲ رقم اعشار باشد.')
      return
    }
    if (values.priceStatus === 'CALL_FOR_PRICE' && values.discountedPrice.trim() !== '') {
      setError('نوع «تماس بگیرید» نباید قیمت فروش ویژه داشته باشد.')
      return
    }
    if (
      values.discountedPrice.trim() !== '' &&
      Number(values.discountedPrice) >= Number(values.price)
    ) {
      setError('قیمت فروش ویژه باید کمتر از قیمت عادی باشد.')
      return
    }
    if (
      values.partnerPrice.trim() !== '' &&
      Number(values.partnerPrice) >= Number(values.price)
    ) {
      setError('قیمت همکار باید کمتر از قیمت عادی باشد.')
      return
    }
    if (
      values.discountStartsAt &&
      values.discountEndsAt &&
      new Date(values.discountEndsAt) <= new Date(values.discountStartsAt)
    ) {
      setError('پایان بازه فروش ویژه باید بعد از شروع آن باشد.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (isEdit) {
        await updateVariant(variant.id, {
          sku: values.sku.trim(),
          barcode: values.barcode.trim() || null,
          name: values.name.trim() || null,
          price: values.price.trim(),
          discountedPrice: values.discountedPrice.trim() || null,
          discountStartsAt: values.discountStartsAt || null,
          discountEndsAt: values.discountEndsAt || null,
          partnerPrice: values.partnerPrice.trim() || null,
          priceSourceCurrency: values.priceSourceCurrency,
          priceStatus: values.priceStatus,
        })
      } else {
        await createVariant(productId, {
          sku: values.sku.trim(),
          barcode: values.barcode.trim() || undefined,
          name: values.name.trim() || undefined,
          price: values.price.trim(),
          discountedPrice: values.discountedPrice.trim() || undefined,
          discountStartsAt: values.discountStartsAt || undefined,
          discountEndsAt: values.discountEndsAt || undefined,
          partnerPrice: values.partnerPrice.trim() || undefined,
          priceSourceCurrency: values.priceSourceCurrency,
          priceStatus: values.priceStatus,
        })
      }
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
    <Alert open={open} onClose={onClose} size="3xl">
      <AlertTitle>{isEdit ? 'ویرایش نوع' : 'افزودن نوع'}</AlertTitle>
      <AlertDescription>
        {isEdit
          ? 'SKU، بارکد، نام و قیمت نوع را ویرایش کنید. موجودی از مسیر «موجودی انبارها» تنظیم میشود.'
          : 'نوع جدید را برای این محصول ثبت کنید. موجودی اولیه پس از ایجاد، از مسیر «موجودی انبارها» دریافت میشود.'}
      </AlertDescription>
      <AlertBody>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <div className="flex items-center justify-between gap-2">
              <Label>SKU</Label>
              {canRegenerate && (
                <Button outline onClick={regenerateSuggestion} disabled={submitting}>
                  <RefreshCw data-slot="icon" />
                  تولید پیشنهاد
                </Button>
              )}
            </div>
            <Input
              name="sku"
              dir="ltr"
              value={values.sku}
              maxLength={SKU_MAX}
              placeholder="مثلاً XPS13-BASE"
              onChange={(event) => set('sku', event.target.value)}
              disabled={submitting}
            />
            <Text className="text-xs text-muted">کد یکتا؛ نباید با SKU نوع دیگری تکراری باشد.</Text>
          </Field>

          <Field>
            <Label>بارکد</Label>
            <Input
              name="barcode"
              dir="ltr"
              value={values.barcode}
              maxLength={BARCODE_MAX}
              placeholder="اختیاری"
              onChange={(event) => set('barcode', event.target.value)}
              disabled={submitting}
            />
            <Text className="text-xs text-muted">در صورت خالی بودن هنگام ویرایش، پاک میشود.</Text>
          </Field>

          <Field>
            <Label>نام نوع / ویژگیها</Label>
            <Input
              name="name"
              value={values.name}
              maxLength={NAME_MAX}
              placeholder="مثلاً مشکی / ۱۲۸ گیگابایت"
              onChange={(event) => set('name', event.target.value)}
              disabled={submitting}
            />
            <Text className="text-xs text-muted">فقط برچسب نمایشی است؛ سیستم ویژگیهای قابلتنظیم هنوز پشتیبانی نمیشود.</Text>
          </Field>

          <Field>
            <Label>واحد پول قیمت</Label>
            <Select
              name="priceSourceCurrency"
              value={values.priceSourceCurrency}
              onChange={(event) =>
                set('priceSourceCurrency', event.target.value as PriceSourceCurrency)
              }
              disabled={submitting}
            >
              {(Object.keys(CURRENCY_LABELS) as PriceSourceCurrency[]).map((code) => (
                <option key={code} value={code}>
                  {CURRENCY_LABELS[code]}
                </option>
              ))}
            </Select>
            <Text className="text-xs text-muted">
              مبلغ دلار/درهم با نرخ دستی جاری به ریال تبدیل و به ۱۰۰٬۰۰۰ ریال
              گرد می‌شود؛ فروشگاه قیمت را به تومان نمایش می‌دهد.
            </Text>
          </Field>

          <Field>
            <Label>قیمت ({CURRENCY_LABELS[values.priceSourceCurrency]})</Label>
            <Input
              name="price"
              dir="ltr"
              inputMode="decimal"
              value={groupMoneyDigits(values.price)}
              placeholder={
                values.priceSourceCurrency === 'RIAL' ? 'مثلاً 1,500,000' : 'مثلاً 120.00'
              }
              onChange={(event) => setMoney('price', event)}
              disabled={submitting}
            />
            <Text className="text-xs text-muted">
              مبلغ منبع؛ قیمت نهایی ریالی پس از تبدیل و گرد شدن در سرور تعیین می‌شود.
            </Text>
          </Field>

          <Field>
            <Label>قیمت فروش ویژه ({CURRENCY_LABELS[values.priceSourceCurrency]})</Label>
            <Input
              name="discountedPrice"
              dir="ltr"
              inputMode="decimal"
              value={groupMoneyDigits(values.discountedPrice)}
              placeholder="اختیاری؛ باید کمتر از قیمت عادی باشد"
              onChange={(event) => setMoney('discountedPrice', event)}
              disabled={submitting}
            />
            <Text className="text-xs text-muted">
              قیمت تبلیغاتی؛ فقط داخل بازه زمانی زیر اعمال می‌شود. خالی کردن هنگام ویرایش آن را پاک می‌کند.
            </Text>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <Label>شروع فروش ویژه (اختیاری)</Label>
              <Input
                name="discountStartsAt"
                dir="ltr"
                type="datetime-local"
                value={values.discountStartsAt ? values.discountStartsAt.slice(0, 16) : ''}
                onChange={(event) =>
                  set('discountStartsAt', event.target.value ? new Date(event.target.value).toISOString() : '')
                }
                disabled={submitting}
              />
            </Field>
            <Field>
              <Label>پایان فروش ویژه (اختیاری)</Label>
              <Input
                name="discountEndsAt"
                dir="ltr"
                type="datetime-local"
                value={values.discountEndsAt ? values.discountEndsAt.slice(0, 16) : ''}
                onChange={(event) =>
                  set('discountEndsAt', event.target.value ? new Date(event.target.value).toISOString() : '')
                }
                disabled={submitting}
              />
            </Field>
          </div>

          <Field>
            <Label>قیمت همکار (ریال)</Label>
            <Input
              name="partnerPrice"
              dir="ltr"
              inputMode="decimal"
              value={groupMoneyDigits(values.partnerPrice)}
              placeholder="اختیاری؛ فقط برای همکار تأییدشده"
              onChange={(event) => setMoney('partnerPrice', event)}
              disabled={submitting}
            />
            <Text className="text-xs text-muted">
              قیمت B2B به ریال؛ در API عمومی هرگز نمایش داده نمی‌شود و فقط برای همکار تأییدشده و فعال قابل مشاهده است.
            </Text>
          </Field>

          <Field>
            <Label>وضعیت قیمت‌گذاری</Label>
            <Select
              name="priceStatus"
              value={values.priceStatus}
              onChange={(event) =>
                set('priceStatus', event.target.value as VariantFormValue['priceStatus'])
              }
              disabled={submitting}
            >
              {(Object.keys(PRICE_STATUS_LABELS) as Array<keyof typeof PRICE_STATUS_LABELS>).map(
                (value) => (
                  <option key={value} value={value}>
                    {PRICE_STATUS_LABELS[value]}
                  </option>
                ),
              )}
            </Select>
            <Text className="text-xs text-muted">«تماس بگیرید» برای کالای بدون قیمت (غیرقابل خرید، نمایشی).</Text>
          </Field>

          {error && (
            <div className="sm:col-span-2">
              <ErrorMessage>{error}</ErrorMessage>
            </div>
          )}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
          {submitting ? 'در حال ذخیره…' : isEdit ? 'ذخیره تغییرات' : 'افزودن نوع'}
        </Button>
      </AlertActions>
    </Alert>
  )
}