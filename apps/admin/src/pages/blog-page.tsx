import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { BlogCategoryDto } from '@sabz/types'
import { useBlogList } from '../hooks/use-blog-list'
import type { BlogStatusFilter } from '../hooks/use-blog-list'
import { translateApiError } from '../lib/error-messages'
import { formatDateTime } from '../lib/format'
import { pageNumbers } from '../lib/pagination'
import { BLOG_STATUS_LABELS, BLOG_STATUS_ORDER } from '../lib/blog-labels'
import { BlogStatusBadge } from '../components/blog/blog-status-badge'
import { BlogCategoryForm } from '../components/blog/blog-category-form'
import { Newspaper, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../components/catalyst/button'
import { Field, Label } from '../components/catalyst/fieldset'
import { Select } from '../components/catalyst/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/catalyst/table'
import { DeleteConfirmDialog } from '../components/ui/delete-confirm-dialog'
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
import { deleteCategory, listCategories } from '../services/blog'

export function BlogPage() {
  const {
    status,
    page,
    limit,
    result,
    loading,
    error,
    mutatingId,
    actionError,
    setStatus,
    setPage,
    refetch,
    publish,
    archive,
  } = useBlogList()
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null)

  const [categories, setCategories] = useState<BlogCategoryDto[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [categoriesError, setCategoriesError] = useState<unknown>(null)
  const [categoryActionError, setCategoryActionError] = useState<string | null>(null)
  const [categoryFormOpen, setCategoryFormOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<BlogCategoryDto | null>(null)
  const [deletingCategory, setDeletingCategory] = useState<BlogCategoryDto | null>(null)

  const refetchCategories = useCallback(async () => {
    setCategoriesLoading(true)
    setCategoriesError(null)
    try {
      setCategories(await listCategories())
    } catch (error) {
      setCategoriesError(error)
      setCategories([])
    } finally {
      setCategoriesLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetchCategories()
  }, [refetchCategories])

  const totalPages = result ? Math.max(1, Math.ceil(result.total / limit)) : 1

  const openCategoryCreate = (): void => {
    setEditingCategory(null)
    setCategoryFormOpen(true)
  }

  const openCategoryEdit = (category: BlogCategoryDto): void => {
    setEditingCategory(category)
    setCategoryFormOpen(true)
  }

  const handleCategoryDelete = async (): Promise<void> => {
    if (!deletingCategory) {
      return
    }
    setDeletingCategory(null)
    setCategoryActionError(null)
    try {
      await deleteCategory(deletingCategory.id)
      await refetchCategories()
    } catch (error) {
      setCategoryActionError(translateApiError(error))
      await refetchCategories()
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="وبلاگ"
        actions={
          <Link to="/blog/new">
            <Button color="primary">
              <Plus data-slot="icon" />
              مطلب جدید
            </Button>
          </Link>
        }
      />

      <div className="flex w-full max-w-xs items-end gap-4">
        <Field className="w-full">
          <Label>وضعیت</Label>
          <Select
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as BlogStatusFilter)}
          >
            <option value="">همه وضعیت‌ها</option>
            {BLOG_STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {BLOG_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {actionError && (
        <p className="danger-box rounded-lg px-3 py-2 text-sm" role="alert">
          {actionError}
        </p>
      )}

      {loading && !result ? (
        <Loading compact label="در حال بارگذاری…" />
      ) : error ? (
        <div className="surface-card flex flex-col items-center gap-4 rounded-xl px-6 py-16 text-center">
          <p className="text-sm/6 text-muted">{translateApiError(error)}</p>
          <Button color="primary" onClick={() => void refetch()}>
            تلاش مجدد
          </Button>
        </div>
      ) : !result || result.items.length === 0 ? (
        <EmptyState
          title="مطلبی یافت نشد"
          description={
            status === ''
              ? 'هنوز مطلبی در وبلاگ ثبت نشده است.'
              : 'در این وضعیت، مطلبی ثبت نشده است.'
          }
          icon={<Newspaper className="size-6" aria-hidden="true" />}
          actions={
            <Link to="/blog/new">
              <Button outline>نوشتن مطلب</Button>
            </Link>
          }
        />
      ) : (
        <TableCard>
          <Table striped>
            <TableHead>
              <TableRow>
                <TableHeader>عنوان</TableHeader>
                <TableHeader>دسته</TableHeader>
                <TableHeader>وضعیت</TableHeader>
                <TableHeader>تاریخ انتشار</TableHeader>
                <TableHeader>
                  <span className="sr-only">عملیات</span>
                </TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.items.map((post) => (
                <TableRow key={post.id}>
                  <TableCell className="font-medium text-foreground">
                    <Link
                      to={`/blog/${post.id}/edit`}
                      className="underline decoration-border underline-offset-4 hover:text-primary"
                    >
                      {post.title}
                    </Link>
                    <span dir="ltr" className="block text-xs font-normal text-muted">
                      {post.slug}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted">
                    {post.category?.name ?? '—'}
                  </TableCell>
                  <TableCell>
                    <BlogStatusBadge status={post.status} />
                  </TableCell>
                  <TableCell className="text-muted">
                    {post.publishedAt ? formatDateTime(post.publishedAt) : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {post.status === 'DRAFT' ? (
                        <Button
                          color="green"
                          disabled={mutatingId !== null}
                          onClick={() => void publish(post.id)}
                        >
                          {mutatingId === post.id ? 'در حال انتشار…' : 'انتشار'}
                        </Button>
                      ) : (
                        <Button
                          outline
                          disabled={mutatingId !== null}
                          onClick={() => setArchiveTargetId(post.id)}
                        >
                          بایگانی
                        </Button>
                      )}
                      <Link
                        to={`/blog/${post.id}/edit`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        ویرایش
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 border-t border-border pt-4">
            <Pagination aria-label="صفحه‌بندی مطالب">
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

      <p className="text-xs text-muted">
        {result ? `مجموع: ${result.total} مطلب · ${limit} مورد در هر صفحه` : ''}
      </p>

      <section aria-labelledby="blog-categories-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="blog-categories-heading" className="text-base font-bold text-foreground">
            دسته‌بندی‌ها
          </h2>
          <Button outline onClick={openCategoryCreate}>
            <Plus data-slot="icon" />
            افزودن دسته‌بندی
          </Button>
        </div>

        {categoryActionError && (
          <p className="danger-box rounded-lg px-3 py-2 text-sm" role="alert">
            {categoryActionError}
          </p>
        )}

        {categoriesLoading ? (
          <Loading compact label="در حال بارگذاری دسته‌بندی‌ها…" />
        ) : categoriesError ? (
          <div className="surface-card flex flex-col items-center gap-4 rounded-xl px-6 py-10 text-center">
            <p className="text-sm/6 text-muted">{translateApiError(categoriesError)}</p>
            <Button color="primary" onClick={() => void refetchCategories()}>
              تلاش مجدد
            </Button>
          </div>
        ) : categories.length === 0 ? (
          <EmptyState
            title="دسته‌بندی ثبت نشده است"
            description="مطالب را می‌توان بدون دسته‌بندی هم منتشر کرد."
            actions={
              <Button outline onClick={openCategoryCreate}>
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
                  <TableHeader>توضیح</TableHeader>
                  <TableHeader>عملیات</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {categories.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium text-foreground">
                      {category.name}
                    </TableCell>
                    <TableCell dir="ltr" className="text-muted">
                      {category.slug}
                    </TableCell>
                    <TableCell className="text-muted">
                      {category.description ?? '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          plain
                          aria-label={`ویرایش ${category.name}`}
                          onClick={() => openCategoryEdit(category)}
                        >
                          <Pencil data-slot="icon" />
                        </Button>
                        <Button
                          plain
                          aria-label={`حذف ${category.name}`}
                          onClick={() => setDeletingCategory(category)}
                        >
                          <Trash2 data-slot="icon" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>

      <DeleteConfirmDialog
        open={archiveTargetId !== null}
        title="بایگانی مطلب"
        description="این مطلب به پیش‌نویس برمی‌گردد و دیگر در فروشگاه نمایش داده نمی‌شود. خود مطلب حذف نمی‌شود."
        confirmLabel="بایگانی مطلب"
        pendingLabel="در حال بایگانی…"
        onClose={() => setArchiveTargetId(null)}
        onConfirm={async () => {
          if (archiveTargetId) {
            await archive(archiveTargetId)
          }
        }}
      />

      <BlogCategoryForm
        open={categoryFormOpen}
        category={editingCategory}
        onClose={() => setCategoryFormOpen(false)}
        onSuccess={() => {
          setCategoryFormOpen(false)
          setEditingCategory(null)
          void refetchCategories()
        }}
      />

      <DeleteConfirmDialog
        open={deletingCategory !== null}
        title="حذف دسته‌بندی"
        description={
          deletingCategory
            ? `دسته‌بندی «${deletingCategory.name}» حذف شود؟ دسته‌ای که مطلب دارد حذف نمی‌شود.`
            : 'این دسته‌بندی حذف شود؟'
        }
        confirmLabel="حذف دسته‌بندی"
        pendingLabel="در حال حذف…"
        onClose={() => setDeletingCategory(null)}
        onConfirm={() => handleCategoryDelete()}
      />
    </div>
  )
}
