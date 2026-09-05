import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ProductDetail, VariantSummary } from '@sabz/types'
import { Save, X } from 'lucide-react'
import { useBrandOptions } from '../../hooks/use-brand-options'
import { useCategoryOptions } from '../../hooks/use-category-options'
import { Button } from '../catalyst/button'
import { Field, Label } from '../catalyst/fieldset'
import { Heading } from '../catalyst/heading'
import { Input } from '../catalyst/input'
import { Select } from '../catalyst/select'
import { Text } from '../catalyst/text'
import { Textarea } from '../catalyst/textarea'
import { Loading } from '../ui/loading'
import { DeleteConfirmDialog } from '../ui/delete-confirm-dialog'
import { ProductStatusBadge } from './product-status-badge'
import { ProductVariantsSection } from './product-variants-section'
import { ProductMediaGrid } from './product-media-grid'
import { VariantForm } from '../variants/variant-form'
import {
  PRODUCT_CONDITION_LABELS,
  PRODUCT_CONDITION_ORDER,
  PRODUCT_STATUS_LABELS,
} from '../../lib/product-labels'
import { translateApiError } from '../../lib/error-messages'
import { createProduct, updateProduct } from '../../services/products'
import { deleteVariant } from '../../services/variants'
import { DESCRIPTION_MAX_LENGTH } from './content-editor/content-editor-constants'

// The rich-text editor is only needed on this route, so it is code-split to
// keep the main admin bundle lean.
const ProductDescriptionEditor = lazy(() =>
  import('./product-description-editor').then((module) => ({
    default: module.ProductDescriptionEditor,
  })),
)

const SHORT_DESCRIPTION_MAX = 500
const DESCRIPTION_MAX = DESCRIPTION_MAX_LENGTH

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

function valuesEqual(a: ProductFormValue, b: ProductFormValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function EditorSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="text-base/7 font-semibold text-foreground">{title}</h2>
      {description && <Text className="mt-1 text-xs text-muted">{description}</Text>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

export function ProductEditor({
  product,
  onSaved,
  onCancel,
  onMutate,
}: {
  product: ProductDetail | null
  onSaved: (saved: ProductDetail) => void
  onCancel: () => void
  /** Called after variant/media mutations so the page can refetch the product. */
  onMutate?: () => void
}) {
  const isEdit = product !== null
  const { categories } = useCategoryOptions()
  const { brands } = useBrandOptions()

  const initial = useMemo<ProductFormValue>(
    () => (product ? fromProduct(product) : EMPTY),
    [product],
  )
  const [values, setValues] = useState<ProductFormValue>(initial)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [variantDialog, setVariantDialog] = useState<
    { mode: 'create' } | { mode: 'edit' | 'delete'; variant: VariantSummary } | null
  >(null)

  const dirty = !valuesEqual(values, initial)

  const set = (key: keyof ProductFormValue, value: string): void => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  // Warn before browser close/refresh when there are unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const handleCancel = (): void => {
    if (dirty) {
      if (!window.confirm('تغییرات ذخیرهنشده دارید؛ بدون ذخیره از این صفحه خارج میشوید؟')) {
        return
      }
    }
    onCancel()
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
      setError('انتخاب دسته بندی الزامی است.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (product) {
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
        onSaved(updated)
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
        onSaved(created)
      }
    } catch (submitError) {
      setError(translateApiError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  const handleVariantSuccess = (): void => {
    setVariantDialog(null)
    onMutate?.()
  }

  const handleVariantConflict = (): void => {
    onMutate?.()
  }

  const handleVariantDelete = async (): Promise<void> => {
    if (variantDialog?.mode !== 'delete') {
      return
    }
    try {
      await deleteVariant(variantDialog.variant.id)
      setVariantDialog(null)
      onMutate?.()
    } catch (error) {
      // Refetch so the variant list reflects the server truth, then rethrow the
      // real error so DeleteConfirmDialog can translate and display it.
      onMutate?.()
      throw error
    }
  }

  const manageable = isEdit && product.status !== 'ARCHIVED'

  return (
    <div className="space-y-6">
      {/* Sticky action header */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <nav className="flex flex-wrap items-center gap-1.5 text-sm text-muted" aria-label="مسیر">
              <Link to="/products" className="font-medium text-primary hover:underline">
                محصولات
              </Link>
              <span aria-hidden="true">/</span>
              <span className="truncate text-foreground">
                {isEdit ? product.name : 'محصول جدید'}
              </span>
              {isEdit && (
                <>
                  <span aria-hidden="true">/</span>
                  <span className="text-foreground">ویرایش</span>
                </>
              )}
            </nav>
            <Heading level={1} className="mt-1 text-xl/8">
              {isEdit ? 'ویرایش محصول' : 'ایجاد محصول'}
            </Heading>
            <Text className="mt-0.5 text-xs text-muted">
              مدیریت اطلاعات محصول، جایگاه کاتالوگ، محتوا، واریانتها و رسانه ها
            </Text>
          </div>
          <div className="flex items-center gap-2">
            <Button outline onClick={handleCancel} disabled={submitting}>
              <X data-slot="icon" />
              انصراف
            </Button>
            <Button color="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
              <Save data-slot="icon" />
              {submitting ? 'در حال ذخیره…' : isEdit ? 'ذخیره محصول' : 'ایجاد محصول'}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="danger-box rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <EditorSection title="اطلاعات پایه">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field className="sm:col-span-2">
                <Label>نام محصول</Label>
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
                  placeholder="در صورت خالی بودن، از نام ساخته میشود"
                  onChange={(event) => set('slug', event.target.value)}
                  disabled={submitting}
                />
                <Text className="text-xs text-muted">
                  فقط حروف انگلیسی کوچک، اعداد و خط تیره.
                </Text>
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
            </div>
          </EditorSection>

          <EditorSection
            title="توضیحات"
            description="توضیح کوتاه برای فهرست و جستجو، و توضیح کامل با قالب بندی غنی برای صفحه محصول."
          >
            <div className="space-y-5">
              <Field>
                <Label>توضیح کوتاه</Label>
                <Textarea
                  name="shortDescription"
                  value={values.shortDescription}
                  maxLength={SHORT_DESCRIPTION_MAX}
                  rows={2}
                  onChange={(event) => set('shortDescription', event.target.value)}
                  disabled={submitting}
                />
                <Text className="text-xs text-muted" dir="ltr">
                  {values.shortDescription.length} / {SHORT_DESCRIPTION_MAX}
                </Text>
              </Field>
              <Field>
                <Label>توضیح کامل (متن غنی)</Label>
                <Suspense fallback={<Loading compact label="در حال بارگذاری ویرایشگر…" />}>
                  <ProductDescriptionEditor
                    value={values.description}
                    maxLength={DESCRIPTION_MAX}
                    disabled={submitting}
                    productId={product?.id}
                    onRequestSave={() => void handleSubmit()}
                    onRequestCancel={handleCancel}
                    onChange={(html) => set('description', html)}
                  />
                </Suspense>
              </Field>
            </div>
          </EditorSection>

          {isEdit && (
            <>
              {/* ProductVariantsSection renders its own card shell. */}
              <ProductVariantsSection
                variants={product.variants}
                manageable={manageable}
                onCreate={() => setVariantDialog({ mode: 'create' })}
                onEdit={(variant) => setVariantDialog({ mode: 'edit', variant })}
                onDelete={(variant) => setVariantDialog({ mode: 'delete', variant })}
              />

              <EditorSection
                title="رسانه ها"
                description="تصاویر و ویدئوهای محصول با واترمارک خودکار برند."
              >
                <ProductMediaGrid
                  media={product.media}
                  variants={product.variants}
                  productId={product.id}
                  manageable={manageable}
                  onRefetch={onMutate ?? (() => undefined)}
                />
              </EditorSection>
            </>
          )}
        </div>

        <div className="space-y-6">
          <EditorSection title="دسته بندی و برند">
            <div className="space-y-5">
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
                <Label>دسته بندی</Label>
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
            </div>
          </EditorSection>

          <EditorSection
            title="وضعیت"
            description={
              isEdit
                ? `وضعیت فعلی: ${PRODUCT_STATUS_LABELS[product.status]}. تغییر وضعیت از طریق اقدامات انتشار/آرشیو انجام میشود.`
                : 'محصول جدید همیشه به صورت پیشنویس ایجاد میشود و برای انتشار باید حداقل یک واریانت داشته باشد.'
            }
          >
            {isEdit ? (
              <ProductStatusBadge status={product.status} />
            ) : (
              <ProductStatusBadge status="DRAFT" />
            )}
          </EditorSection>

          <EditorSection title="ابعاد و وزن (اختیاری)">
            <div className="grid grid-cols-1 gap-5">
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
                <Label>عرض (سانتیمتر)</Label>
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
                <Label>ارتفاع (سانتیمتر)</Label>
                <Input
                  name="heightCm"
                  dir="ltr"
                  inputMode="decimal"
                  value={values.heightCm}
                  onChange={(event) => set('heightCm', event.target.value)}
                  disabled={submitting}
                />
              </Field>
              <Field>
                <Label>عمق (سانتیمتر)</Label>
                <Input
                  name="depthCm"
                  dir="ltr"
                  inputMode="decimal"
                  value={values.depthCm}
                  onChange={(event) => set('depthCm', event.target.value)}
                  disabled={submitting}
                />
              </Field>
            </div>
          </EditorSection>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button outline onClick={handleCancel} disabled={submitting}>
          <X data-slot="icon" />
          انصراف
        </Button>
        <Button color="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
          <Save data-slot="icon" />
          {submitting ? 'در حال ذخیره…' : isEdit ? 'ذخیره محصول' : 'ایجاد محصول'}
        </Button>
      </div>

      {isEdit && (
        <VariantForm
          open={
            variantDialog !== null &&
            (variantDialog.mode === 'create' || variantDialog.mode === 'edit')
          }
          productId={product.id}
          variant={variantDialog?.mode === 'edit' ? variantDialog.variant : null}
          onClose={() => setVariantDialog(null)}
          onSuccess={handleVariantSuccess}
          onConflict={handleVariantConflict}
        />
      )}

      <DeleteConfirmDialog
        open={variantDialog?.mode === 'delete'}
        title="حذف واریانت"
        description={
          variantDialog?.mode === 'delete'
            ? `واریانت «${variantDialog.variant.sku}» از چیدمان فعال محصول حذف میشود.`
            : ''
        }
        confirmLabel="حذف واریانت"
        onClose={() => setVariantDialog(null)}
        onConfirm={handleVariantDelete}
      />
    </div>
  )
}