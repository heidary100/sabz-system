import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useProductDetail } from '../hooks/use-product-detail'
import { useCategoryOptions } from '../hooks/use-category-options'
import { useBrandOptions } from '../hooks/use-brand-options'
import { translateApiError } from '../lib/error-messages'
import { formatDateTime } from '../lib/format'
import { PRODUCT_CONDITION_LABELS } from '../lib/product-labels'
import { archiveProduct, deleteProduct, publishProduct } from '../services/products'
import { deleteVariant } from '../services/variants'
import { Button } from '../components/catalyst/button'
import { Heading, Subheading } from '../components/catalyst/heading'
import { EmptyState } from '../components/ui/empty-state'
import { Loading } from '../components/ui/loading'
import { DeleteConfirmDialog } from '../components/ui/delete-confirm-dialog'
import { ProductStatusBadge } from '../components/products/product-status-badge'
import { ProductForm } from '../components/products/product-form'
import { LifecycleConfirmDialog } from '../components/products/lifecycle-confirm-dialog'
import { ProductVariantsSection } from '../components/products/product-variants-section'
import { ProductMediaSection } from '../components/products/product-media-section'
import { VariantForm } from '../components/variants/variant-form'
import { VariantInventoryDialog } from '../components/variants/variant-inventory-dialog'
import type { ProductDetail, VariantSummary } from '@sabz/types'

type DialogName = 'edit' | 'publish' | 'archive' | 'delete' | null

type VariantDialogState =
  | { mode: 'create' }
  | { mode: 'edit' | 'delete' | 'stock'; variant: VariantSummary }
  | null

function InfoItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="space-y-1">
      <dt className="text-sm font-medium text-dust-200">{label}</dt>
      <dd dir="auto" className="text-sm text-foreground">
        {value || '—'}
      </dd>
    </div>
  )
}

function ProductEditDialog({
  open,
  product,
  onClose,
  onSuccess,
}: {
  open: boolean
  product: ProductDetail
  onClose: () => void
  onSuccess: () => void
}) {
  const { categories } = useCategoryOptions()
  const { brands } = useBrandOptions()

  return (
    <ProductForm
      open={open}
      product={product}
      brands={brands}
      categories={categories}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  )
}

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { product, loading, error, refetch } = useProductDetail(id ?? '')

  const [dialog, setDialog] = useState<DialogName>(null)
  const [variantDialog, setVariantDialog] = useState<VariantDialogState>(null)

  if (loading && !product) {
    return <Loading label="در حال بارگذاری محصول…" />
  }

  if (error && !product) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-white px-6 py-16 text-center">
          <p className="text-sm/6 text-dust-200">{translateApiError(error)}</p>
          <Button color="primary" onClick={() => void refetch()}>
            تلاش مجدد
          </Button>
          <Link to="/products" className="text-sm font-medium text-primary hover:underline">
            بازگشت به فهرست محصولات
          </Link>
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <EmptyState
          title="محصول یافت نشد"
          description="این محصول در دسترس نیست."
          actions={
            <Link to="/products">
              <Button outline>بازگشت به فهرست</Button>
            </Link>
          }
        />
      </div>
    )
  }

  const runAction = async (action: 'publish' | 'archive' | 'delete'): Promise<void> => {
    try {
      if (action === 'publish') {
        await publishProduct(product.id)
      } else if (action === 'archive') {
        await archiveProduct(product.id)
      } else {
        await deleteProduct(product.id)
        navigate('/products')
        return
      }
      await refetch()
    } catch (error) {
      await refetch()
      throw error
    }
  }

  const handleEditSuccess = (): void => {
    setDialog(null)
    void refetch()
  }

  const handleVariantSuccess = (): void => {
    setVariantDialog(null)
    void refetch()
  }

  const handleVariantConflict = (): void => {
    void refetch()
  }

  const handleVariantDelete = async (): Promise<void> => {
    if (variantDialog?.mode !== 'delete') {
      return
    }
    try {
      await deleteVariant(variantDialog.variant.id)
      void refetch()
    } catch (error) {
      void refetch()
      throw error
    }
  }

  const manageable = product.status !== 'ARCHIVED'

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Link to="/products" className="text-sm font-medium text-primary hover:underline">
            بازگشت به فهرست محصولات
          </Link>
          <div className="flex items-center gap-3">
            <Heading level={1}>{product.name}</Heading>
            <ProductStatusBadge status={product.status} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {product.status === 'DRAFT' && (
            <>
              <Button outline onClick={() => setDialog('edit')}>
                ویرایش
              </Button>
              <Button color="primary" onClick={() => setDialog('publish')}>
                انتشار
              </Button>
            </>
          )}
          {product.status === 'PUBLISHED' && (
            <>
              <Button outline onClick={() => setDialog('edit')}>
                ویرایش
              </Button>
              <Button outline onClick={() => setDialog('archive')}>
                آرشیو
              </Button>
            </>
          )}
          {product.status === 'ARCHIVED' && (
            <Button color="red" onClick={() => setDialog('delete')}>
              حذف
            </Button>
          )}
        </div>
      </div>

      {product.status === 'ARCHIVED' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          این محصول آرشیوشده است و قابل ویرایش نیست.
        </div>
      )}

      <section className="rounded-lg border border-border bg-white p-6">
        <Subheading>اطلاعات کسب‌وکار محصول</Subheading>
        <dl className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <InfoItem label="نام" value={product.name} />
          <InfoItem label="اسلاگ" value={product.slug} />
          <div className="sm:col-span-2">
            <InfoItem label="توضیح کوتاه" value={product.shortDescription} />
          </div>
          <div className="sm:col-span-2">
            <InfoItem label="توضیح کامل" value={product.description} />
          </div>
          <InfoItem label="برند" value={product.brand.name} />
          <InfoItem label="دسته‌بندی" value={product.category.name} />
          <InfoItem label="وضعیت کالا" value={PRODUCT_CONDITION_LABELS[product.condition]} />
          <InfoItem label="گارانتی" value={product.warranty} />
          <InfoItem label="کشور مبدأ" value={product.originCountry} />
          <InfoItem
            label="ابعاد و وزن"
            value={
              product.weightKg !== null ||
              product.widthCm !== null ||
              product.heightCm !== null ||
              product.depthCm !== null
                ? [
                    product.weightKg !== null ? `وزن ${product.weightKg} کیلوگرم` : null,
                    product.widthCm !== null ? `عرض ${product.widthCm} سانتی‌متر` : null,
                    product.heightCm !== null ? `ارتفاع ${product.heightCm} سانتی‌متر` : null,
                    product.depthCm !== null ? `عمق ${product.depthCm} سانتی‌متر` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : null
            }
          />
          <InfoItem label="تاریخ ایجاد" value={formatDateTime(product.createdAt)} />
          <InfoItem label="تاریخ به‌روزرسانی" value={formatDateTime(product.updatedAt)} />
        </dl>
      </section>

      <ProductVariantsSection
        variants={product.variants}
        manageable={manageable}
        onCreate={() => setVariantDialog({ mode: 'create' })}
        onEdit={(variant) => setVariantDialog({ mode: 'edit', variant })}
        onStock={(variant) => setVariantDialog({ mode: 'stock', variant })}
        onDelete={(variant) => setVariantDialog({ mode: 'delete', variant })}
      />
      <ProductMediaSection media={product.media} />

      {dialog === 'edit' && (
        <ProductEditDialog
          open
          product={product}
          onClose={() => setDialog(null)}
          onSuccess={handleEditSuccess}
        />
      )}

      <LifecycleConfirmDialog
        open={dialog === 'publish'}
        title="انتشار محصول"
        description={`آیا از انتشار محصول «${product.name}» مطمئن هستید؟`}
        confirmLabel="انتشار"
        pendingLabel="در حال انتشار…"
        onClose={() => setDialog(null)}
        onConfirm={() => runAction('publish')}
      />

      <LifecycleConfirmDialog
        open={dialog === 'archive'}
        title="آرشیو محصول"
        description={`با آرشیو این محصول، آن دیگر در فروشگاه نمایش داده نمی‌شود. ادامه می‌دهید؟`}
        confirmLabel="آرشیو"
        pendingLabel="در حال آرشیو…"
        onClose={() => setDialog(null)}
        onConfirm={() => runAction('archive')}
      />

      <LifecycleConfirmDialog
        open={dialog === 'delete'}
        title="حذف محصول"
        description={`آیا از حذف محصول «${product.name}» مطمئن هستید؟ این عمل قابل بازگشت نیست.`}
        confirmLabel="حذف"
        pendingLabel="در حال حذف…"
        color="red"
        onClose={() => setDialog(null)}
        onConfirm={() => runAction('delete')}
      />

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

      <VariantInventoryDialog
        open={variantDialog?.mode === 'stock'}
        variant={variantDialog?.mode === 'stock' ? variantDialog.variant : null}
        onClose={() => setVariantDialog(null)}
        onSuccess={handleVariantSuccess}
        onConflict={handleVariantConflict}
      />

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
