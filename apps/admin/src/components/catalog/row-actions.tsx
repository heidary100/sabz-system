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
    <div className="flex items-center gap-1">
      <Link
        to={`/products/${productId}`}
        aria-label={`مشاهده ${productName}`}
        title={`مشاهده ${productName}`}
        className="rounded-lg p-2 text-muted transition hover:bg-primary-subtle hover:text-primary"
      >
        <Eye className="size-4" aria-hidden />
      </Link>
      <Link
        to={`/products/${productId}/edit`}
        aria-label={`ویرایش ${productName}`}
        title={`ویرایش ${productName}`}
        className="rounded-lg p-2 text-muted transition hover:bg-primary-subtle hover:text-primary"
      >
        <Pencil className="size-4" aria-hidden />
      </Link>
      <button
        type="button"
        aria-label={`حذف واریانت ${sku}`}
        title={`حذف واریانت ${sku}`}
        className="rounded-lg p-2 text-muted transition hover:bg-red-50 hover:text-red-600"
        onClick={onDelete}
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    </div>
  )
}
