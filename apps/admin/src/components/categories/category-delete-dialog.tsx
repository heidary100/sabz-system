import { useState } from 'react'
import type { CategoryTreeNode } from '@sabz/types'
import { Folder, TriangleAlert } from 'lucide-react'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { translateApiError } from '../../lib/error-messages'
import { countChildren, lookupNode } from '../../lib/category-tree-utils'

const fa = new Intl.NumberFormat('fa-IR')

export function CategoryDeleteDialog({
  category,
  tree,
  onClose,
  onConfirm,
}: {
  category: CategoryTreeNode | null
  tree: CategoryTreeNode[]
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lookup = category ? lookupNode(tree, category.id) : null
  const childCount = category ? countChildren(category) : 0

  const handleConfirm = async (): Promise<void> => {
    if (!category) {
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (error) {
      setError(translateApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Alert open={category !== null} onClose={onClose} size="sm">
      <AlertBody>
        <TriangleAlert
          className="mx-auto mb-3 size-8 text-red-600 dark:text-red-400"
          aria-hidden="true"
        />
        <AlertTitle>حذف دسته بندی</AlertTitle>
        <AlertDescription>
          آیا از حذف دسته بندی «{category?.name ?? ''}» مطمئن هستید؟ این عمل قابل
          بازگشت نیست.
        </AlertDescription>

        {category && (
          <dl className="mt-4 space-y-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm/6">
            <div className="flex items-center gap-2">
              <Folder className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <dt className="sr-only">دسته بندی</dt>
              <dd className="min-w-0 flex-1 truncate font-medium text-foreground">
                {category.name}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-muted">والد</dt>
              <dd className="truncate text-foreground">
                {lookup?.parent ? lookup.parent.name : 'ریشه'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-muted">زیردسته ها</dt>
              <dd className="text-foreground">{fa.format(childCount)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-muted">محصولات</dt>
              <dd className="text-foreground">{fa.format(category.productCount)}</dd>
            </div>
          </dl>
        )}

        {(childCount > 0 || (category?.productCount ?? 0) > 0) && (
          <p className="warning-box mt-4 rounded-lg px-3 py-2 text-sm/6">
            این دسته بندی هنوز{' '}
            {childCount > 0 && `${fa.format(childCount)} زیردسته`}
            {childCount > 0 && (category?.productCount ?? 0) > 0 && ' و '}
            {(category?.productCount ?? 0) > 0 && `${fa.format(category!.productCount)} محصول فعال`}{' '}
            دارد؛ ابتدا آنها را جابهجا یا حذف کنید.
          </p>
        )}

        {error && <p className="danger-box mt-4 rounded-lg px-3 py-2 text-sm">{error}</p>}
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          انصراف
        </Button>
        <Button color="red" onClick={() => void handleConfirm()} disabled={submitting}>
          {submitting ? 'در حال حذف…' : 'حذف'}
        </Button>
      </AlertActions>
    </Alert>
  )
}