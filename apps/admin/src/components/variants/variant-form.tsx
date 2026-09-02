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
import { createVariant, updateVariant } from '../../services/variants'

const PRICE_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/

const SKU_MAX = 64
const BARCODE_MAX = 64
const NAME_MAX = 255

interface VariantFormValue {
  sku: string
  barcode: string
  name: string
  price: string
  stockQuantity: string
}

const EMPTY: VariantFormValue = {
  sku: '',
  barcode: '',
  name: '',
  price: '',
  stockQuantity: '',
}

function fromVariant(variant: VariantSummary): VariantFormValue {
  return {
    sku: variant.sku,
    barcode: variant.barcode ?? '',
    name: variant.name ?? '',
    price: variant.price,
    stockQuantity: '',
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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValues(variant ? fromVariant(variant) : EMPTY)
      setError(null)
    }
  }, [open, variant])

  const set = (key: keyof VariantFormValue, value: string): void => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const priceValid = PRICE_PATTERN.test(values.price.trim())

  let stockError: string | null = null
  if (!isEdit && values.stockQuantity.trim() !== '') {
    const parsed = Number(values.stockQuantity)
    if (!Number.isInteger(parsed) || parsed < 0) {
      stockError = 'موجودی باید عدد صحیح و غیرمنفی باشد.'
    }
  }

  const canSubmit =
    values.sku.trim().length > 0 &&
    priceValid &&
    stockError === null &&
    !submitting

  const handleSubmit = async (): Promise<void> => {
    if (!values.sku.trim()) {
      setError('SKU الزامی است.')
      return
    }
    if (!priceValid) {
      setError('قیمت باید عدد اعشاری معتبر با حداکثر ۲ رقم اعشار باشد.')
      return
    }
    if (stockError) {
      setError(stockError)
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
        })
      } else {
        await createVariant(productId, {
          sku: values.sku.trim(),
          barcode: values.barcode.trim() || undefined,
          name: values.name.trim() || undefined,
          price: values.price.trim(),
          ...(values.stockQuantity.trim() !== ''
            ? { stockQuantity: Number(values.stockQuantity) }
            : {}),
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
          ? 'SKU، بارکد، نام و قیمت واریانت را ویرایش کنید. موجودی از مسیر جداگانه تنظیم میشود.'
          : 'واریانت جدید را برای این محصول ثبت کنید.'}
      </AlertDescription>
      <AlertBody>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <Label>SKU</Label>
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
            <Label>قیمت (تومان)</Label>
            <Input
              name="price"
              dir="ltr"
              inputMode="decimal"
              value={values.price}
              placeholder="مثلاً 1500.00"
              onChange={(event) => set('price', event.target.value)}
              disabled={submitting}
            />
          </Field>

          {!isEdit && (
            <Field className="sm:col-span-2">
              <Label>موجودی اولیه</Label>
              <Input
                name="stockQuantity"
                type="number"
                dir="ltr"
                min={0}
                step={1}
                value={values.stockQuantity}
                placeholder="۰"
                onChange={(event) => set('stockQuantity', event.target.value)}
                disabled={submitting}
              />
              <Text className="text-xs text-muted">
                نمای کلی موجودی (M1). پس از ایجاد، موجودی از مسیر «موجودی» تنظیم میشود.
              </Text>
            </Field>
          )}

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