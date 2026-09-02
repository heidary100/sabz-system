import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ProductDetail, ProductStatus } from '@sabz/types'
import { useProductList } from '../hooks/use-product-list'
import { useCategoryOptions } from '../hooks/use-category-options'
import { useBrandOptions } from '../hooks/use-brand-options'
import { translateApiError } from '../lib/error-messages'
import { formatDate } from '../lib/format'
import { pageNumbers } from '../lib/pagination'
import {
  PRODUCT_CONDITION_LABELS,
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUS_ORDER,
} from '../lib/product-labels'
import { Package, Plus } from 'lucide-react'
import { Button } from '../components/catalyst/button'
import { Field, Label } from '../components/catalyst/fieldset'
import { Input } from '../components/catalyst/input'
import { Select } from '../components/catalyst/select'
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
import { ProductStatusBadge } from '../components/products/product-status-badge'
import { ProductForm } from '../components/products/product-form'

const SEARCH_DEBOUNCE_MS = 300

export function ProductsPage() {
  const navigate = useNavigate()
  const {
    search,
    status,
    categoryId,
    brandId,
    page,
    limit,
    result,
    loading,
    error,
    setSearch,
    setStatus,
    setCategoryId,
    setBrandId,
    setPage,
    refetch,
  } = useProductList()
  const { categories: categoryOptions } = useCategoryOptions()
  const { brands: brandOptions } = useBrandOptions()

  const [searchInput, setSearchInput] = useState(search)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput, setSearch])

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1
  const hasActiveFilter =
    status !== '' || categoryId !== '' || brandId !== '' || search.trim() !== ''

  const openProduct = (productId: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    navigate(`/products/${productId}`)
  }

  const clearFilters = (): void => {
    setSearchInput('')
    setSearch('')
    setStatus('')
    setCategoryId('')
    setBrandId('')
  }

  const handleCreated = (product: ProductDetail): void => {
    setCreateOpen(false)
    navigate(`/products/${product.id}`)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="محصولات"
        actions={
          <Button color="primary" onClick={() => setCreateOpen(true)}>
            <Plus data-slot="icon" />
            افزودن محصول
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field className="sm:col-span-2 lg:col-span-4">
          <Label>جستجو</Label>
          <Input
            type="search"
            name="search"
            placeholder="جستجو با نام یا اسلاگ…"
            maxLength={64}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </Field>
        <Field>
          <Label>وضعیت</Label>
          <Select
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ProductStatus | '')}
          >
            <option value="">همه</option>
            {PRODUCT_STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {PRODUCT_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>دسته‌بندی</Label>
          <Select
            name="categoryId"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">همه</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>برند</Label>
          <Select
            name="brandId"
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
          >
            <option value="">همه</option>
            {brandOptions.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

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
          icon={<Package />}
          title="محصولی یافت نشد"
          description={
            hasActiveFilter
              ? 'با این فیلترها محصولی ثبت نشده است.'
              : 'هنوز محصولی ثبت نشده است.'
          }
          actions={
            hasActiveFilter ? (
              <Button outline onClick={clearFilters}>
                حذف فیلترها
              </Button>
            ) : (
              <Button outline onClick={() => setCreateOpen(true)}>
                افزودن محصول
              </Button>
            )
          }
        />
      ) : (
        <TableCard>
          <Table striped>
            <TableHead>
              <TableRow>
                <TableHeader>نام محصول</TableHeader>
                <TableHeader>اسلاگ</TableHeader>
                <TableHeader>برند</TableHeader>
                <TableHeader>دسته‌بندی</TableHeader>
                <TableHeader>وضعیت</TableHeader>
                <TableHeader>وضعیت کالا</TableHeader>
                <TableHeader>تاریخ ایجاد</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.items.map((product) => (
                <TableRow
                  key={product.id}
                  href={`/products/${product.id}`}
                  title={`مشاهده ${product.name}`}
                  onNavigate={openProduct(product.id)}
                >
                  <TableCell className="font-medium text-foreground">
                    {product.name}
                  </TableCell>
                  <TableCell dir="ltr" className="text-muted">
                    {product.slug}
                  </TableCell>
                  <TableCell className="text-muted">{product.brand.name}</TableCell>
                  <TableCell className="text-muted">{product.category.name}</TableCell>
                  <TableCell>
                    <ProductStatusBadge status={product.status} />
                  </TableCell>
                  <TableCell className="text-muted">
                    {PRODUCT_CONDITION_LABELS[product.condition]}
                  </TableCell>
                  <TableCell className="text-muted">
                    {formatDate(product.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 border-t border-border pt-4">
            <Pagination aria-label="صفحه‌بندی محصولات">
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
        {result ? `مجموع: ${result.total} محصول · ${limit} مورد در هر صفحه` : ''}
      </p>

      <ProductForm
        open={createOpen}
        product={null}
        brands={brandOptions}
        categories={categoryOptions}
        onClose={() => setCreateOpen(false)}
        onSuccess={handleCreated}
      />
    </div>
  )
}
