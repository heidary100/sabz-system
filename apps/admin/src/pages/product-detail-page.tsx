import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useProductDetail } from '../hooks/use-product-detail'
import { translateApiError } from '../lib/error-messages'
import { formatDateTime } from '../lib/format'
import { PRODUCT_CONDITION_LABELS } from '../lib/product-labels'
import { Package, Pencil, Trash2 } from 'lucide-react'
import { archiveProduct, deleteProduct, publishProduct } from '../services/products'
import { deleteVariant } from '../services/variants'
import { Button } from '../components/catalyst/button'
import { Heading, Subheading } from '../components/catalyst/heading'
import { EmptyState } from '../components/ui/empty-state'
import { Loading } from '../components/ui/loading'
import { InfoItem } from '../components/ui/info-item'
import { RichText } from '../components/ui/rich-text'
import { DeleteConfirmDialog } from '../components/ui/delete-confirm-dialog'
import { ProductStatusBadge } from '../components/products/product-status-badge'
import { LifecycleConfirmDialog } from '../components/products/lifecycle-confirm-dialog'
import { ProductVariantsSection } from '../components/products/product-variants-section'
import { ProductMediaSection } from '../components/products/product-media-section'
import { VariantForm } from '../components/variants/variant-form'
import type { VariantSummary } from '@sabz/types'

type DialogName = 'publish' | 'archive' | 'delete' | null

type VariantDialogState =
  | { mode: 'create' }
  | { mode: 'edit' | 'delete'; variant: VariantSummary }
  | null

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
        <div className="glass flex flex-col items-center gap-4 rounded-xl px-6 py-16 text-center">
          <p className="text-sm/6 text-muted">{translateApiError(error)}</p>
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
          icon={<Package />}
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
              <Button outline onClick={() => navigate(`/products/${product.id}/edit`)}>
                <Pencil data-slot="icon" />
                ویرایش
              </Button>
              <Button color="primary" onClick={() => setDialog('publish')}>
                انتشار
              </Button>
            </>
          )}
          {product.status === 'PUBLISHED' && (
            <>
              <Button outline onClick={() => navigate(`/products/${product.id}/edit`)}>
                <Pencil data-slot="icon" />
                ویرایش
              </Button>
              <Button outline onClick={() => setDialog('archive')}>
                آرشیو
              </Button>
            </>
          )}
          {product.status === 'ARCHIVED' && (
            <Button color="red" onClick={() => setDialog('delete')}>
              <Trash2 data-slot="icon" />
              حذف
            </Button>
          )}
        </div>
      </div>

      {product.status === 'ARCHIVED' && (
        <div className="warning-box rounded-lg px-4 py-3 text-sm">
          این محصول آرشیوشده است و قابل ویرایش نیست.
        </div>
      )}

      <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <Subheading>اطلاعات کسب‌وکار محصول</Subheading>
        <dl className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <InfoItem label="نام" value={product.name} />
          <InfoItem label="اسلاگ" value={product.slug} />
          <div className="sm:col-span-2">
            <InfoItem label="توضیح کوتاه" value={product.shortDescription} />
          </div>
          <div className="sm:col-span-2">
            <dt className="text-sm font-medium text-muted">توضیح کامل</dt>
            <dd className="mt-1">
              {product.description ? (
                <RichText html={product.description} />
              ) : (
                <span className="text-sm text-foreground">—</span>
              )}
            </dd>
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
        onDelete={(variant) => setVariantDialog({ mode: 'delete', variant })}
      />
      <ProductMediaSection
        media={product.media}
        variants={product.variants}
        productId={product.id}
        manageable={manageable}
        onRefetch={() => void refetch()}
      />

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
