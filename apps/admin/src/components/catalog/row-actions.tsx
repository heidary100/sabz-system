import { Link } from 'react-router-dom'
import { Eye, Pencil, Trash2 } from 'lucide-react'

/**
 * Fixed row actions of the products grid (SS-257): product detail, product
 * edit page and variant soft-delete. Product-level fields stay on the edit
 * page by design (a product can span several variant rows).
 */
export interface RowActionsProps {
  productId: string
  productName: string
  sku: string
  onDelete: () => void
}

export function RowActions({ productId, productName, sku, onDelete }: RowActionsProps) {
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
