import { useEffect, useState } from 'react'
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
import { suggestSku } from '../../lib/sku-suggestion'
import { createVariant, updateVariant } from '../../services/variants'

const PRICE_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/

const SKU_MAX = 64
const BARCODE_MAX = 64
const NAME_MAX = 255

const PRICE_STATUS_LABELS: Record<'PRICED' | 'CALL_FOR_PRICE', string> = {
  PRICED: 'قیمت‌دار (قابل خرید)',
  CALL_FOR_PRICE: 'تماس بگیرید (بدون قیمت)',
}

interface VariantFormValue {
  sku: string
  barcode: string
  name: string
  price: string
  compareAtPrice: string
  priceStatus: 'PRICED' | 'CALL_FOR_PRICE'
}

const EMPTY: VariantFormValue = {
  sku: '',
  barcode: '',
  name: '',
  price: '',
  compareAtPrice: '',
  priceStatus: 'PRICED',
}

function fromVariant(variant: VariantSummary): VariantFormValue {
  return {
    sku: variant.sku,
    barcode: variant.barcode ?? '',
    name: variant.name ?? '',
    price: variant.price,
    compareAtPrice: variant.compareAtPrice ?? '',
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
      key === 'price' || key === 'compareAtPrice'
        ? foldDigitsToEnglish(value)
        : value
    if (key === 'sku') {
      setSkuTouched(true)
    }
    setValues((prev) => ({ ...prev, [key]: normalized }))
  }

  // SS-256: the suggestion is only ever replaced while the field is untouched
  // or empty — a manual edit can never be discarded by regenerate.
  const canRegenerate = !isEdit && (!skuTouched || values.sku.trim() === '')
  const regenerateSuggestion = (): void => {
    setValues((prev) => ({ ...prev, sku: suggestSku() }))
  }

  const priceValid = PRICE_PATTERN.test(values.price.trim())
  const compareAtValid =
    values.compareAtPrice.trim() === '' ||
    PRICE_PATTERN.test(values.compareAtPrice.trim())

  const canSubmit =
    values.sku.trim().length > 0 && priceValid && compareAtValid && !submitting

  const handleSubmit = async (): Promise<void> => {
    if (!values.sku.trim()) {
      setError('SKU الزامی است.')
      return
    }
    if (!priceValid) {
      setError('قیمت باید عدد اعشاری معتبر با حداکثر ۲ رقم اعشار باشد.')
      return
    }
    if (!compareAtValid) {
      setError('قیمت فروش ویژه باید عدد اعشاری معتبر با حداکثر ۲ رقم اعشار باشد.')
      return
    }
    if (values.priceStatus === 'CALL_FOR_PRICE' && values.compareAtPrice.trim() !== '') {
      setError('واریانت «تماس بگیرید» نباید قیمت فروش ویژه داشته باشد.')
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
          compareAtPrice: values.compareAtPrice.trim() || null,
          priceStatus: values.priceStatus,
        })
      } else {
        await createVariant(productId, {
          sku: values.sku.trim(),
          barcode: values.barcode.trim() || undefined,
          name: values.name.trim() || undefined,
          price: values.price.trim(),
          compareAtPrice: values.compareAtPrice.trim() || undefined,
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
      <AlertTitle>{isEdit ? 'ویرایش واریانت' : 'افزودن واریانت'}</AlertTitle>
      <AlertDescription>
        {isEdit
          ? 'SKU، بارکد، نام و قیمت واریانت را ویرایش کنید. موجودی از مسیر «موجودی انبارها» تنظیم میشود.'
          : 'واریانت جدید را برای این محصول ثبت کنید. موجودی اولیه پس از ایجاد، از مسیر «موجودی انبارها» دریافت میشود.'}
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
            <Text className="text-xs text-muted">کد یکتا؛ نباید با SKU واریانت دیگری تکراری باشد.</Text>
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
            <Label>نام واریانت / ویژگیها</Label>
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
            <Label>قیمت (ریال)</Label>
            <Input
              name="price"
              dir="ltr"
              inputMode="decimal"
              value={values.price}
              placeholder="مثلاً 1500.00"
              onChange={(event) => set('price', event.target.value)}
              disabled={submitting}
            />
            <Text className="text-xs text-muted">
              مبنا ریال است؛ فروشگاه قیمت را به تومان (ریال ÷ ۱۰) نمایش میدهد.
            </Text>
          </Field>

          <Field>
            <Label>قیمت فروش ویژه (ریال)</Label>
            <Input
              name="compareAtPrice"
              dir="ltr"
              inputMode="decimal"
              value={values.compareAtPrice}
              placeholder="اختیاری؛ باید از قیمت بیشتر باشد"
              onChange={(event) => set('compareAtPrice', event.target.value)}
              disabled={submitting}
            />
            <Text className="text-xs text-muted">قیمت قبل از تخفیف؛ در صورت خالی بودن هنگام ویرایش، پاک میشود.</Text>
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
          {submitting ? 'در حال ذخیره…' : isEdit ? 'ذخیره تغییرات' : 'افزودن واریانت'}
        </Button>
      </AlertActions>
    </Alert>
  )
}