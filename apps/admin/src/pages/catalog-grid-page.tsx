import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CatalogGridRowResult } from '@sabz/types'
import { useCatalogGrid } from '../hooks/use-catalog-grid'
import { useCatalogDrafts } from '../hooks/use-catalog-drafts'
import type { CatalogGridRow } from '@sabz/types'
import { translateApiError } from '../lib/error-messages'
import { groupMoneyDigits } from '../lib/money-input'
import type { GridColumnKey } from '../lib/grid-columns'
import {
  GRID_COLUMN_LABELS,
  readVisibleColumns,
  writeVisibleColumns,
} from '../lib/grid-columns'
import { GRID_STATUS_LABELS } from '../lib/grid-messages'
import { PRODUCT_STATUS_LABELS, PRODUCT_STATUS_ORDER } from '../lib/product-labels'
import { Package } from 'lucide-react'
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
import { Text } from '../components/catalyst/text'
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
import { pageNumbers } from '../lib/pagination'
import { useCategoryOptions } from '../hooks/use-category-options'
import { useBrandOptions } from '../hooks/use-brand-options'
import { EditableCell } from '../components/catalog/editable-cell'
import { ColumnVisibilityMenu } from '../components/catalog/column-visibility-menu'
import { UnsavedChangesBar } from '../components/catalog/unsaved-changes-bar'
import { RowConflictDialog } from '../components/catalog/row-conflict-dialog'

const SEARCH_DEBOUNCE_MS = 300

const DIRTY_GUARD_MESSAGE = 'تغییرات ذخیرهنشده دارید؛ با ادامه این تغییرات از بین میروند. ادامه میدهید؟'

export function CatalogGridPage() {
  const grid = useCatalogGrid()
  const { setSearch, setSku } = grid
  const drafts = useCatalogDrafts()
  const { categories: categoryOptions } = useCategoryOptions()
  const { brands: brandOptions } = useBrandOptions()

  const [searchInput, setSearchInput] = useState(grid.filters.search)
  const [skuInput, setSkuInput] = useState(grid.filters.sku)
  const [visibleColumns, setVisibleColumns] = useState<GridColumnKey[]>(readVisibleColumns)
  const [conflictQueue, setConflictQueue] = useState<CatalogGridRowResult[]>([])
  const [requestError, setRequestError] = useState<string | null>(null)

  // Debounced server-side filters (search + dedicated SKU filter).
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput, setSearch])
  useEffect(() => {
    const timer = setTimeout(() => setSku(skuInput), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [skuInput, setSku])

  // Warn before browser close/refresh when there are unsaved changes.
  useEffect(() => {
    if (!drafts.hasDirty) return
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [drafts.hasDirty])

  const guardDirtyFilters = (): boolean => {
    if (!drafts.hasDirty) return true
    if (window.confirm(DIRTY_GUARD_MESSAGE)) {
      drafts.discardAll()
      return true
    }
    return false
  }

  const changeFilter = (apply: () => void): (() => void) => (): void => {
    if (guardDirtyFilters()) {
      apply()
    }
  }

  const toggleColumn = (key: GridColumnKey): void => {
    const next = visibleColumns.includes(key)
      ? visibleColumns.filter((column) => column !== key)
      : [...visibleColumns, key]
    setVisibleColumns(next)
    writeVisibleColumns(next)
  }

  const submitAndReconcile = (outcome: Awaited<ReturnType<typeof drafts.saveAll>>): void => {
    const successes = outcome.results.filter((result) => result.outcome === 'SUCCESS')
    grid.applyRowPatches(
      successes.map((result) => ({
        variantId: result.variantId,
        price: result.price ?? '',
        compareAtPrice: result.compareAtPrice ?? null,
        expectedUpdatedAt: result.updatedAt ?? '',
        stock: result.stock,
      })),
    )
    const unresolved = outcome.results.filter(
      (result) => result.outcome === 'CONFLICT_CHANGED' || result.outcome === 'CONFLICT_LOCKED',
    )
    if (unresolved.length > 0) {
      // Refresh the authoritative rows (values + new tokens) before showing
      // the conflict dialog, so the operator sees the server truth.
      void grid.refetch().then(() => setConflictQueue(unresolved))
    }
  }

  const handleSave = async (): Promise<void> => {
    setRequestError(null)
    const outcome = await drafts.saveAll()
    if (outcome.requestError !== null) {
      setRequestError(translateApiError(outcome.requestError))
      return
    }
    submitAndReconcile(outcome)
  }

  /** Retry one locked row: resubmits its draft as a single-row batch. */
  const retryRow = async (variantId: string): Promise<void> => {
    setRequestError(null)
    drafts.resolveConflictRow(variantId, 'keep')
    const outcome = await drafts.saveRows([variantId])
    if (outcome.requestError !== null) {
      setRequestError(translateApiError(outcome.requestError))
      return
    }
    submitAndReconcile(outcome)
  }

  const handleDiscard = (): void => {
    if (!window.confirm(DIRTY_GUARD_MESSAGE)) {
      return
    }
    // Zero-drift cancel: drop client-side drafts only, nothing is sent.
    drafts.discardAll()
    setConflictQueue([])
    setRequestError(null)
  }

  const resolveConflict = (mode: 'keep' | 'drop'): void => {
    const current = conflictQueue[0]
    if (!current) {
      return
    }
    drafts.resolveConflictRow(current.variantId, mode)
    setConflictQueue((prev) => prev.slice(1))
  }

  const conflictResult = conflictQueue[0] ?? null
  const conflictRow: CatalogGridRow | undefined = conflictResult
    ? grid.rows.find((row) => row.variantId === conflictResult.variantId)
    : undefined

  const totalPages = grid.total > 0 ? Math.max(1, Math.ceil(grid.total / grid.limit)) : 1
  const showColumn = (key: GridColumnKey): boolean => visibleColumns.includes(key)

  const cellValue = (row: CatalogGridRow, field: 'price' | 'compareAtPrice' | 'stock'): string => {
    const draft = drafts.drafts[row.variantId]
    if (field === 'price') {
      return draft?.price !== undefined ? groupMoneyDigits(draft.price) : groupMoneyDigits(row.price)
    }
    if (field === 'compareAtPrice') {
      const source =
        draft?.compareAtPrice !== undefined ? draft.compareAtPrice : row.compareAtPrice
      return source === null || source === undefined ? '' : groupMoneyDigits(source)
    }
    return draft?.stock ?? String(row.stock)
  }

  const cellError = (row: CatalogGridRow, field: string): string | undefined => {
    const rowErrors = drafts.errors[row.variantId]
    if (!rowErrors) return undefined
    return rowErrors[field] ?? rowErrors['_']
  }

  const renderCell = (row: CatalogGridRow, field: 'price' | 'compareAtPrice' | 'stock') => {
    const status = drafts.statuses[row.variantId] ?? 'clean'
    if (field === 'stock' && !row.stockEditable) {
      return (
        <span dir="ltr" className="text-sm text-muted">
          {row.stock}{' '}
          <Link
            to={`/inventory/variants/${row.variantId}`}
            className="text-xs text-primary hover:underline"
          >
            (مدیریت انبار)
          </Link>
        </span>
      )
    }
    return (
      <EditableCell
        kind={field}
        value={cellValue(row, field)}
        status={status}
        error={cellError(row, field)}
        ariaLabel={`${GRID_COLUMN_LABELS[field === 'price' ? 'regularPrice' : field === 'compareAtPrice' ? 'salePrice' : 'stock']} — ${row.sku}`}
        onChange={(value) =>
          drafts.editCell(
            {
              variantId: row.variantId,
              expectedUpdatedAt: row.expectedUpdatedAt,
              price: row.price,
              compareAtPrice: row.compareAtPrice,
              stock: row.stock,
              priceStatus: row.priceStatus,
            },
            field,
            value,
          )
        }
      />
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="شبکه کاتالوگ"
        subtitle="ویرایش سریع قیمت و موجودی؛ تغییرات با «ذخیره تغییرات» اعمال میشود."
        actions={
          <ColumnVisibilityMenu visible={visibleColumns} onToggle={toggleColumn} />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Field className="sm:col-span-2">
          <Label>جستجوی محصول</Label>
          <Input
            type="search"
            name="grid-search"
            placeholder="نام یا اسلاگ…"
            maxLength={64}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </Field>
        <Field>
          <Label>شناسه کالا (SKU)</Label>
          <Input
            type="search"
            name="grid-sku"
            dir="ltr"
            placeholder="SKU…"
            maxLength={64}
            value={skuInput}
            onChange={(event) => setSkuInput(event.target.value)}
          />
        </Field>
        <Field>
          <Label>وضعیت</Label>
          <Select
            name="grid-status"
            value={grid.filters.status}
            onChange={(event) =>
              changeFilter(() => grid.setStatus(event.target.value as never))()
            }
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
          <Label>برند</Label>
          <Select
            name="grid-brand"
            value={grid.filters.brandId}
            onChange={(event) => changeFilter(() => grid.setBrandId(event.target.value))()}
          >
            <option value="">همه</option>
            {brandOptions.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>دسته‌بندی</Label>
          <Select
            name="grid-category"
            value={grid.filters.categoryId}
            onChange={(event) => changeFilter(() => grid.setCategoryId(event.target.value))()}
          >
            <option value="">همه</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <UnsavedChangesBar
        dirtyCount={drafts.dirtyCount}
        saving={drafts.saving}
        savingCount={drafts.savingCount}
        failedCount={drafts.failedCount}
        succeededCount={drafts.succeededCount}
        requestError={requestError}
        onSave={() => void handleSave()}
        onDiscard={handleDiscard}
      />

      {grid.loading && !grid.rows.length ? (
        <Loading compact label="در حال بارگذاری…" />
      ) : grid.error && grid.rows.length === 0 ? (
        <div className="glass flex flex-col items-center gap-4 rounded-xl px-6 py-16 text-center">
          <p className="text-sm/6 text-muted">{translateApiError(grid.error)}</p>
          <Button color="primary" onClick={() => void grid.refetch()}>
            تلاش مجدد
          </Button>
        </div>
      ) : grid.rows.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title="ردیفی یافت نشد"
          description="با این فیلترها واریانتی ثبت نشده است."
        />
      ) : (
        <TableCard>
          <div className="overflow-x-auto">
            <Table striped>
              <TableHead>
                <TableRow>
                  {showColumn('thumbnail') && <TableHeader>تصویر</TableHeader>}
                  <TableHeader>نام محصول</TableHeader>
                  <TableHeader>SKU</TableHeader>
                  {showColumn('brand') && <TableHeader>برند</TableHeader>}
                  {showColumn('category') && <TableHeader>دسته‌بندی</TableHeader>}
                  <TableHeader>موجودی</TableHeader>
                  <TableHeader>قیمت فروش</TableHeader>
                  <TableHeader>فروش ویژه</TableHeader>
                  <TableHeader>وضعیت قیمت</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {grid.rows.map((row) => {
                  const status = drafts.statuses[row.variantId] ?? 'clean'
                  return (
                    <TableRow key={row.variantId}>
                      {showColumn('thumbnail') && (
                        <TableCell>
                          {row.thumbnailUrl ? (
                            <img
                              src={row.thumbnailUrl}
                              alt=""
                              className="size-10 rounded-md object-cover"
                            />
                          ) : (
                            <div className="flex size-10 items-center justify-center rounded-md bg-zinc-100 text-zinc-400">
                              <Package className="size-4" aria-hidden />
                            </div>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="font-medium text-foreground">
                        <Link to={`/products/${row.productId}`} className="hover:underline">
                          {row.productName}
                        </Link>
                      </TableCell>
                      <TableCell dir="ltr" className="text-sm text-muted">
                        {row.sku}
                      </TableCell>
                      {showColumn('brand') && (
                        <TableCell className="text-muted">{row.brandName ?? 'بدون برند'}</TableCell>
                      )}
                      {showColumn('category') && (
                        <TableCell className="text-muted">{row.categoryName}</TableCell>
                      )}
                      <TableCell>{renderCell(row, 'stock')}</TableCell>
                      <TableCell>{renderCell(row, 'price')}</TableCell>
                      <TableCell>{renderCell(row, 'compareAtPrice')}</TableCell>
                      <TableCell>
                        <Text className="text-sm text-muted">
                          {GRID_STATUS_LABELS[row.priceStatus]}
                        </Text>
                        {status === 'conflict-changed' ? (
                          <button
                            type="button"
                            className="mt-1 block text-xs font-medium text-primary hover:underline"
                            onClick={() => setConflictQueue([{
                              variantId: row.variantId,
                              outcome: 'CONFLICT_CHANGED',
                            }])}
                          >
                            بررسی تغییر نسخه
                          </button>
                        ) : null}
                        {status === 'conflict-locked' ? (
                          <button
                            type="button"
                            className="mt-1 block text-xs font-medium text-primary hover:underline"
                            onClick={() => void retryRow(row.variantId)}
                          >
                            تلاش مجدد
                          </button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <Pagination aria-label="صفحه‌بندی شبکه کاتالوگ">
              <PaginationPrevious
                disabled={grid.filters.page <= 1 || grid.loading}
                onClick={() =>
                  changeFilter(() => grid.setPage(grid.filters.page - 1))()
                }
              />
              <PaginationList>
                {pageNumbers(grid.filters.page, totalPages).map((item, index) =>
                  item === 'gap' ? (
                    <PaginationGap key={`gap-${index}`} />
                  ) : (
                    <PaginationPage
                      key={item}
                      current={item === grid.filters.page}
                      disabled={grid.loading}
                      onClick={() => changeFilter(() => grid.setPage(item))()}
                    >
                      {item}
                    </PaginationPage>
                  ),
                )}
              </PaginationList>
              <PaginationNext
                disabled={grid.filters.page >= totalPages || grid.loading}
                onClick={() =>
                  changeFilter(() => grid.setPage(grid.filters.page + 1))()
                }
              />
            </Pagination>
          </div>
        </TableCard>
      )}

      <p className="text-xs text-muted">
        {grid.total > 0
          ? `مجموع: ${grid.total} واریانت · ${grid.limit} مورد در هر صفحه`
          : ''}
      </p>

      <RowConflictDialog
        result={conflictResult}
        serverPrice={conflictRow ? groupMoneyDigits(conflictRow.price) : null}
        serverCompareAt={conflictRow?.compareAtPrice ? groupMoneyDigits(conflictRow.compareAtPrice) : null}
        serverStock={conflictRow ? conflictRow.stock : null}
        onKeepDraft={() => resolveConflict('keep')}
        onDropDraft={() => resolveConflict('drop')}
        onClose={() => setConflictQueue([])}
      />
    </div>
  )
}
