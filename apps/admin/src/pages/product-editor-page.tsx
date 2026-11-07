import { Link, useNavigate, useParams } from 'react-router-dom'
import { useProductDetail } from '../hooks/use-product-detail'
import { translateApiError } from '../lib/error-messages'
import { Package } from 'lucide-react'
import { Button } from '../components/catalyst/button'
import { EmptyState } from '../components/ui/empty-state'
import { Loading } from '../components/ui/loading'
import { ErrorState } from '../components/ui/error-state'
import { ProductEditor } from '../components/products/product-editor'

/**
 * Dedicated full-page product editor. Serves both creation (`/products/new`)
 * and editing (`/products/:id/edit`) through the same `ProductEditor`
 * workspace; create and edit share all sections but the UX is context-aware.
 */
export function ProductEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = Boolean(id)
  const { product, loading, error, refetch } = useProductDetail(isEdit ? (id ?? '') : '')

  if (isEdit) {
    if (loading && !product) {
      return <Loading label="در حال بارگذاری محصول…" />
    }
    if (error && !product) {
      return (
        <div className="mx-auto max-w-6xl space-y-6">
          <ErrorState message={translateApiError(error)} onRetry={() => void refetch()}>
            <Link to="/products" className="text-sm font-medium text-primary hover:underline">
              بازگشت به فهرست محصولات
            </Link>
          </ErrorState>
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
    if (product.status === 'ARCHIVED') {
      return (
        <div className="mx-auto max-w-6xl space-y-6">
          <ErrorState
            message="محصول آرشیوشده قابل ویرایش نیست؛ ابتدا وضعیت آن را بازگردانید."
          >
            <Link to={`/products/${product.id}`}>
              <Button outline>بازگشت به جزئیات محصول</Button>
            </Link>
          </ErrorState>
        </div>
      )
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <ProductEditor
        product={isEdit && product ? product : null}
        onSaved={(saved) =>
          isEdit ? navigate(`/products/${saved.id}`) : navigate(`/products/${saved.id}/edit`)
        }
        onCancel={() => navigate('/products')}
        onMutate={isEdit ? () => void refetch() : undefined}
      />
    </div>
  )
}