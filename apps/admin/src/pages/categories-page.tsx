import { useState } from 'react'
import type { CategoryDetail, CategorySummary } from '@sabz/types'
import { useCategoryList } from '../hooks/use-category-list'
import { useCategoryOptions } from '../hooks/use-category-options'
import { translateApiError } from '../lib/error-messages'
import { pageNumbers } from '../lib/pagination'
import { FolderTree, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../components/catalyst/button'
import { Text } from '../components/catalyst/text'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/catalyst/table'
import { EmptyState } from '../components/ui/empty-state'
import { Loading } from '../components/ui/loading'
import { PageHeader } from '../components/ui/page-header'
import { TableCard } from '../components/ui/table-card'
import {
  Pagination,
  PaginationGap,
  PaginationList,
  PaginationNext,
  PaginationPage,
  PaginationPrevious,
} from '../components/ui/pagination'
import { DeleteConfirmDialog } from '../components/ui/delete-confirm-dialog'
import { CategoryForm } from '../components/categories/category-form'
import { deleteCategory } from '../services/categories'

export function CategoriesPage() {
  const { page, limit, result, loading, error, setPage, refetch } = useCategoryList()
  const { categories: options } = useCategoryOptions()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CategoryDetail | null>(null)
  const [deleting, setDeleting] = useState<CategorySummary | null>(null)

  const parentName = (parentId: string | null): string => {
    if (!parentId) {
      return '—'
    }
    return options.find((item) => item.id === parentId)?.name ?? '—'
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1

  const openCreate = (): void => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (category: CategorySummary): void => {
    setEditing({ ...category, children: [] })
    setFormOpen(true)
  }

  const handleSuccess = (): void => {
    setFormOpen(false)
    setEditing(null)
    void refetch()
  }

  const handleDelete = async (): Promise<void> => {
    if (deleting) {
      await deleteCategory(deleting.id)
      setDeleting(null)
      void refetch()
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="دسته‌بندی‌ها"
        actions={
          <Button color="primary" onClick={openCreate}>
            <Plus data-slot="icon" />
            افزودن دسته‌بندی
          </Button>
        }
      />

      {loading && !result ? (
        <Loading compact label="در حال بارگذاری…" />
      ) : error ? (
        <div className="glass flex flex-col items-center gap-4 rounded-xl px-6 py-16 text-center">
          <p className="text-sm/6 text-muted">{translateApiError(error)}</p>
          <Button color="primary" onClick={() => void refetch()}>
            تلاش مجدد
          </Button>
        </div>
      ) : !result || result.items.length === 0 ? (
        <EmptyState
          icon={<FolderTree />}
          title="دسته‌بندی‌ای یافت نشد"
          description="هنوز دسته‌بندی‌ای ثبت نشده است."
          actions={
            <Button outline onClick={openCreate}>
              افزودن دسته‌بندی
            </Button>
          }
        />
      ) : (
        <TableCard>
          <Table striped>
            <TableHead>
              <TableRow>
                <TableHeader>نام</TableHeader>
                <TableHeader>اسلاگ</TableHeader>
                <TableHeader>والد</TableHeader>
                <TableHeader>ترتیب</TableHeader>
                <TableHeader>نمایش</TableHeader>
                <TableHeader>عملیات</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.items.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium text-foreground">
                    {category.name}
                  </TableCell>
                  <TableCell dir="ltr" className="text-muted">
                    {category.slug}
                  </TableCell>
                  <TableCell className="text-muted">
                    {parentName(category.parentId)}
                  </TableCell>
                  <TableCell className="text-muted">{category.sortOrder}</TableCell>
                  <TableCell className="text-muted">
                    {category.isVisible ? 'بله' : 'خیر'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button plain onClick={() => openEdit(category)}>
                        <Pencil data-slot="icon" />
                        ویرایش
                      </Button>
                      <Button outline onClick={() => setDeleting(category)}>
                        <Trash2 data-slot="icon" />
                        حذف
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 border-t border-border pt-4">
            <Pagination aria-label="صفحه‌بندی دسته‌بندی‌ها">
              <PaginationPrevious
                disabled={page <= 1 || loading}
                onClick={() => setPage(page - 1)}
              />
              <PaginationList>
                {pageNumbers(page, totalPages).map((item, index) =>
                  item === 'gap' ? (
                    <PaginationGap key={`gap-${index}`} />
                  ) : (
                    <PaginationPage
                      key={item}
                      current={item === page}
                      disabled={loading}
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </PaginationPage>
                  ),
                )}
              </PaginationList>
              <PaginationNext
                disabled={page >= totalPages || loading}
                onClick={() => setPage(page + 1)}
              />
            </Pagination>
          </div>
        </TableCard>
      )}

      {loading && result && (
        <div className="flex items-center justify-center gap-3 py-4" role="status">
          <span
            aria-hidden="true"
            className="size-5 animate-spin rounded-full border-2 border-hunter-800 border-t-primary"
          />
          <span className="text-sm font-medium text-muted">در حال بارگذاری…</span>
        </div>
      )}

      <Text className="text-xs text-muted">
        {result ? `مجموع: ${result.total} دسته‌بندی · ${limit} مورد در هر صفحه` : ''}
      </Text>

      <CategoryForm
        open={formOpen}
        category={editing}
        categories={options}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSuccess={handleSuccess}
      />

      <DeleteConfirmDialog
        open={deleting !== null}
        title="حذف دسته‌بندی"
        description={
          deleting
            ? `آیا از حذف دسته‌بندی «${deleting.name}» مطمئن هستید؟ این عمل قابل بازگشت نیست.`
            : ''
        }
        confirmLabel="حذف"
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}
