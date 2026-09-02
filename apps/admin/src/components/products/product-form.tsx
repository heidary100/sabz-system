import { useEffect, useState } from 'react'
import type { BrandSummary, CategorySummary, ProductDetail } from '@sabz/types'
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
import { Textarea } from '../catalyst/textarea'
import { Text } from '../catalyst/text'
import { PRODUCT_CONDITION_LABELS, PRODUCT_CONDITION_ORDER } from '../../lib/product-labels'
import { translateApiError } from '../../lib/error-messages'
import { createProduct, updateProduct } from '../../services/products'

interface ProductFormValue {
  name: string
  slug: string
  shortDescription: string
  description: string
  brandId: string
  categoryId: string
  warranty: string
  condition: string
  weightKg: string
  widthCm: string
  heightCm: string
  depthCm: string
  originCountry: string
}

const EMPTY: ProductFormValue = {
  name: '',
  slug: '',
  shortDescription: '',
  description: '',
  brandId: '',
  categoryId: '',
  warranty: '',
  condition: 'NEW',
  weightKg: '',
  widthCm: '',
  heightCm: '',
  depthCm: '',
  originCountry: '',
}

function fromProduct(product: ProductDetail): ProductFormValue {
  return {
    name: product.name,
    slug: product.slug,
    shortDescription: product.shortDescription ?? '',
    description: product.description ?? '',
    brandId: product.brand.id,
    categoryId: product.category.id,
    warranty: product.warranty ?? '',
    condition: product.condition,
    weightKg: product.weightKg ?? '',
    widthCm: product.widthCm ?? '',
    heightCm: product.heightCm ?? '',
    depthCm: product.depthCm ?? '',
    originCountry: product.originCountry ?? '',
  }
}

export function ProductForm({
  open,
  product,
  brands,
  categories,
  onClose,
  onSuccess,
}: {
  open: boolean
  product: ProductDetail | null
  brands: BrandSummary[]
  categories: CategorySummary[]
  onClose: () => void
  onSuccess: (created: ProductDetail) => void
}) {
  const isEdit = product !== null

  const [values, setValues] = useState<ProductFormValue>(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValues(product ? fromProduct(product) : EMPTY)
      setError(null)
    }
  }, [open, product])

  const set = (key: keyof ProductFormValue, value: string): void => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const canSubmit =
    values.name.trim().length > 0 &&
    Boolean(values.brandId) &&
    Boolean(values.categoryId) &&
    !submitting

  const handleSubmit = async (): Promise<void> => {
    if (!values.name.trim()) {
      setError('نام محصول الزامی است.')
      return
    }
    if (!values.brandId) {
      setError('انتخاب برند الزامی است.')
      return
    }
    if (!values.categoryId) {
      setError('انتخاب دسته‌بندی الزامی است.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (isEdit) {
        const updated = await updateProduct(product.id, {
          name: values.name.trim(),
          ...(values.slug.trim() ? { slug: values.slug.trim() } : {}),
          shortDescription: values.shortDescription.trim() || undefined,
          description: values.description.trim() || undefined,
          brandId: values.brandId,
          categoryId: values.categoryId,
          warranty: values.warranty.trim() || undefined,
          condition: values.condition as ProductDetail['condition'],
          weightKg: values.weightKg.trim() || null,
          widthCm: values.widthCm.trim() || null,
          heightCm: values.heightCm.trim() || null,
          depthCm: values.depthCm.trim() || null,
          originCountry: values.originCountry.trim() || null,
        })
        onSuccess(updated)
      } else {
        const created = await createProduct({
          name: values.name.trim(),
          ...(values.slug.trim() ? { slug: values.slug.trim() } : {}),
          shortDescription: values.shortDescription.trim() || undefined,
          description: values.description.trim() || undefined,
          brandId: values.brandId,
          categoryId: values.categoryId,
          warranty: values.warranty.trim() || undefined,
          condition: values.condition as ProductDetail['condition'],
          weightKg: values.weightKg.trim() || undefined,
          widthCm: values.widthCm.trim() || undefined,
          heightCm: values.heightCm.trim() || undefined,
          depthCm: values.depthCm.trim() || undefined,
          originCountry: values.originCountry.trim() || undefined,
        })
        onSuccess(created)
      }
    } catch (error) {
      setError(translateApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Alert open={open} onClose={onClose} size="3xl">
      <AlertTitle>{isEdit ? 'ویرایش محصول' : 'افزودن محصول'}</AlertTitle>
      <AlertDescription>
        {isEdit
          ? 'اطلاعات محصول را ویرایش کنید.'
          : 'محصول جدید همیشه به‌صورت پیش‌نویس ایجاد می‌شود و برای انتشار باید حداقل یک واریانت داشته باشد.'}
      </AlertDescription>
      <AlertBody>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2">
            <Label>نام</Label>
            <Input
              name="name"
              value={values.name}
              maxLength={255}
              onChange={(event) => set('name', event.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field className="sm:col-span-2">
            <Label>اسلاگ</Label>
            <Input
              name="slug"
              dir="ltr"
              value={values.slug}
              maxLength={255}
              placeholder="در صورت خالی بودن، از نام ساخته می‌شود"
              onChange={(event) => set('slug', event.target.value)}
              disabled={submitting}
            />
            <Text className="text-xs text-muted">
              فقط حروف انگلیسی کوچک، اعداد و خط تیره.
            </Text>
          </Field>

          <Field>
            <Label>برند</Label>
            <Select
              name="brandId"
              value={values.brandId}
              onChange={(event) => set('brandId', event.target.value)}
              disabled={submitting}
            >
              <option value="">انتخاب کنید</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field>
            <Label>دسته‌بندی</Label>
            <Select
              name="categoryId"
              value={values.categoryId}
              onChange={(event) => set('categoryId', event.target.value)}
              disabled={submitting}
            >
              <option value="">انتخاب کنید</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field>
            <Label>وضعیت کالا</Label>
            <Select
              name="condition"
              value={values.condition}
              onChange={(event) => set('condition', event.target.value)}
              disabled={submitting}
            >
              {PRODUCT_CONDITION_ORDER.map((value) => (
                <option key={value} value={value}>
                  {PRODUCT_CONDITION_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>

          <Field>
            <Label>گارانتی</Label>
            <Input
              name="warranty"
              value={values.warranty}
              maxLength={255}
              onChange={(event) => set('warranty', event.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field className="sm:col-span-2">
            <Label>توضیح کوتاه</Label>
            <Textarea
              name="shortDescription"
              value={values.shortDescription}
              maxLength={500}
              rows={2}
              onChange={(event) => set('shortDescription', event.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field className="sm:col-span-2">
            <Label>توضیح کامل</Label>
            <Textarea
              name="description"
              value={values.description}
              maxLength={10000}
              rows={4}
              onChange={(event) => set('description', event.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field>
            <Label>وزن (کیلوگرم)</Label>
            <Input
              name="weightKg"
              dir="ltr"
              inputMode="decimal"
              value={values.weightKg}
              placeholder="مثلاً 1.250"
              onChange={(event) => set('weightKg', event.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field>
            <Label>کشور مبدأ</Label>
            <Input
              name="originCountry"
              value={values.originCountry}
              maxLength={100}
              onChange={(event) => set('originCountry', event.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field>
            <Label>عرض (سانتی‌متر)</Label>
            <Input
              name="widthCm"
              dir="ltr"
              inputMode="decimal"
              value={values.widthCm}
              onChange={(event) => set('widthCm', event.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field>
            <Label>ارتفاع (سانتی‌متر)</Label>
            <Input
              name="heightCm"
              dir="ltr"
              inputMode="decimal"
              value={values.heightCm}
              onChange={(event) => set('heightCm', event.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field className="sm:col-span-2">
            <Label>عمق (سانتی‌متر)</Label>
            <Input
              name="depthCm"
              dir="ltr"
              inputMode="decimal"
              value={values.depthCm}
              onChange={(event) => set('depthCm', event.target.value)}
              disabled={submitting}
            />
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
          {submitting ? 'در حال ذخیره…' : isEdit ? 'ذخیره تغییرات' : 'افزودن محصول'}
        </Button>
      </AlertActions>
    </Alert>
  )
}
