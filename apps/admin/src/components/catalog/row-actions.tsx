import { Link } from 'react-router-dom'
import { ExternalLink, Eye, Pencil, Trash2 } from 'lucide-react'
import { storefrontProductUrl } from '../../lib/storefront-url'

/**
 * Fixed row actions of the products grid (SS-257): product detail, product
 * edit page and variant soft-delete. Product-level fields stay on the edit
 * page by design (a product can span several variant rows).
 */
export interface RowActionsProps {
  productId: string
  productName: string
  productSlug: string
  productStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  sku: string
  onDelete: () => void
}

export function RowActions({
  productId,
  productName,
  productSlug,
  productStatus,
  sku,
  onDelete,
}: RowActionsProps) {
  return (
    <div className="flex items-center gap-0.5">
      <Link
        to={`/products/${productId}`}
        aria-label={`مشاهده ${productName}`}
        title={`مشاهده ${productName}`}
        className="rounded-lg p-1.5 text-muted transition hover:bg-primary-subtle hover:text-primary focus-ring"
      >
        <Eye className="size-4" aria-hidden />
      </Link>
      {productStatus === 'PUBLISHED' ? (
        <a
          href={storefrontProductUrl(productSlug)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`مشاهده ${productName} در فروشگاه`}
          title={`مشاهده ${productName} در فروشگاه`}
          className="rounded-lg p-1.5 text-muted transition hover:bg-primary-subtle hover:text-primary focus-ring"
        >
          <ExternalLink className="size-4" aria-hidden />
        </a>
      ) : (
        <span
          aria-label={`${productName} منتشر نشده است؛ لینک فروشگاه غیرفعال است`}
          title="فقط محصولات منتشرشده لینک عمومی دارند"
          className="inline-flex cursor-not-allowed rounded-lg p-1.5 text-muted/40"
        >
          <ExternalLink className="size-4" aria-hidden />
        </span>
      )}
      <Link
        to={`/products/${productId}/edit`}
        aria-label={`ویرایش ${productName}`}
        title={`ویرایش ${productName}`}
        className="rounded-lg p-1.5 text-muted transition hover:bg-primary-subtle hover:text-primary focus-ring"
      >
        <Pencil className="size-4" aria-hidden />
      </Link>
      <button
        type="button"
        aria-label={`حذف نوع ${sku}`}
        title={`حذف نوع ${sku}`}
        className="rounded-lg p-1.5 text-muted transition hover:bg-danger-subtle hover:text-danger focus-ring"
        onClick={onDelete}
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    </div>
  )
}
