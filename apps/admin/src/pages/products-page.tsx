import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, Package, Plus, SlidersHorizontal } from 'lucide-react'
import type {
  CatalogGridRow,
  CatalogGridRowResult,
  CatalogGridSortField,
} from '@sabz/types'
import { useCatalogGrid } from '../hooks/use-catalog-grid'
import { useCatalogDrafts } from '../hooks/use-catalog-drafts'
import { useCategoryOptions } from '../hooks/use-category-options'
import { useBrandOptions } from '../hooks/use-brand-options'
import { deleteVariant } from '../services/variants'
import { translateApiError } from '../lib/error-messages'
import { formatDate } from '../lib/format'
import { groupMoneyDigits } from '../lib/money-input'
import type { GridColumnKey } from '../lib/grid-columns'
import {
  GRID_COLUMN_LABELS,
  readVisibleColumns,
  writeVisibleColumns,
} from '../lib/grid-columns'
import { GRID_STATUS_LABELS } from '../lib/grid-messages'
import {
  PRODUCT_CONDITION_LABELS,
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUS_ORDER,
} from '../lib/product-labels'
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
import { TablePagination } from '../components/ui/table-pagination'
import { MultiSelectCheckbox } from '../components/ui/multi-select-checkbox'
import { DeleteConfirmDialog } from '../components/ui/delete-confirm-dialog'
import { EditableCell, PriceStatusCell } from '../components/catalog/editable-cell'
import { FilterChips } from '../components/catalog/filter-chips'
import type { FilterChip } from '../components/catalog/filter-chips'
import { RowActions } from '../components/catalog/row-actions'
import { UnsavedChangesBar } from '../components/catalog/unsaved-changes-bar'
import { ColumnChips } from '../components/catalog/column-chips'
import { HorizontalScroll } from '../components/ui/horizontal-scroll'
import { RowConflictDialog } from '../components/catalog/row-conflict-dialog'

const SEARCH_DEBOUNCE_MS = 300

const DIRTY_GUARD_MESSAGE = 'تغییرات ذخیرهنشده دارید؛ با ادامه این تغییرات از بین میروند. ادامه میدهید؟'

function SortableHeader({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string
  field: CatalogGridSortField
  sortBy: CatalogGridSortField | ''
  sortDir: 'asc' | 'desc'
  onSort: (field: CatalogGridSortField) => void
}) {
  const active = sortBy === field
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 transition hover:text-foreground"
      onClick={() => onSort(field)}
    >
      {label}
      {active ? (
        sortDir === 'asc' ? (
          <ArrowUp className="size-3.5" aria-hidden />
        ) : (
          <ArrowDown className="size-3.5" aria-hidden />
        )
      ) : (
        <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />
      )}
    </button>
  )
}

/**
 * Products page = the SS-257 editable catalog grid: a responsive,
 * server-paginated variant table with advanced URL-driven filters, global
 * search, checkbox column visibility, inline variant-field editing behind an
 * explicit batch save, and per-row actions (detail / edit / variant delete).
 */
export function ProductsPage() {
  const navigate = useNavigate()
  const grid = useCatalogGrid()
  const {
    setSearch,
    setSku,
    setStatuses,
    setCategoryIds,
    setBrandIds,
    setPriceStatus,
    setCondition,
    setStockStatus,
    setPriceRange,
    setSort,
    setPage,
    setLimit,
  } = grid
  const drafts = useCatalogDrafts()
  const { categories: categoryOptions } = useCategoryOptions()
  const { brands: brandOptions } = useBrandOptions()

  const [searchInput, setSearchInput] = useState(grid.filters.search)
  const [skuInput, setSkuInput] = useState(grid.filters.sku)
  const [minPriceInput, setMinPriceInput] = useState(grid.filters.minPrice)
  const [maxPriceInput, setMaxPriceInput] = useState(grid.filters.maxPrice)
  const [visibleColumns, setVisibleColumns] = useState<GridColumnKey[]>(readVisibleColumns)
  const [conflictQueue, setConflictQueue] = useState<CatalogGridRowResult[]>([])
  const [requestError, setRequestError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ variantId: string; sku: string } | null>(
    null,
  )
  // SS-268: the filter panel collapses below xl (chips row stays visible);
  // above xl the grid is always expanded via CSS.
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Guarded debounced server-side filters. On decline the local input
  // reverts to the committed URL value so it never lies about the query.
  useEffect(() => {
    if (searchInput === grid.filters.search) return
    const timer = setTimeout(() => {
      if (!drafts.hasDirty || window.confirm(DIRTY_GUARD_MESSAGE)) {
        if (drafts.hasDirty) drafts.discardAll()
        setSearch(searchInput)
      } else {
        setSearchInput(grid.filters.search)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput, grid.filters.search, drafts, setSearch])

  useEffect(() => {
    if (skuInput === grid.filters.sku) return
    const timer = setTimeout(() => {
      if (!drafts.hasDirty || window.confirm(DIRTY_GUARD_MESSAGE)) {
        if (drafts.hasDirty) drafts.discardAll()
        setSku(skuInput)
      } else {
        setSkuInput(grid.filters.sku)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [skuInput, grid.filters.sku, drafts, setSku])

  useEffect(() => {
    if (minPriceInput === grid.filters.minPrice && maxPriceInput === grid.filters.maxPrice) {
      return
    }
    const timer = setTimeout(() => {
      if (!drafts.hasDirty || window.confirm(DIRTY_GUARD_MESSAGE)) {
        if (drafts.hasDirty) drafts.discardAll()
        setPriceRange(minPriceInput, maxPriceInput)
      } else {
        setMinPriceInput(grid.filters.minPrice)
        setMaxPriceInput(grid.filters.maxPrice)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [minPriceInput, maxPriceInput, grid.filters.minPrice, grid.filters.maxPrice, drafts, setPriceRange])

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

  const changeFilter = (apply: () => void): (() => void) => (): void => {
    if (!drafts.hasDirty || window.confirm(DIRTY_GUARD_MESSAGE)) {
      if (drafts.hasDirty) drafts.discardAll()
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
        sku: result.sku,
        barcode: result.barcode,
        variantName: result.variantName,
        priceStatus: result.priceStatus,
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

  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget) {
      return
    }
    await deleteVariant(deleteTarget.variantId)
    drafts.discardRow(deleteTarget.variantId)
    setDeleteTarget(null)
    await grid.refetch()
  }

  const conflictResult = conflictQueue[0] ?? null
  const conflictRow: CatalogGridRow | undefined = conflictResult
    ? grid.rows.find((row) => row.variantId === conflictResult.variantId)
    : undefined

  const totalPages = grid.total > 0 ? Math.max(1, Math.ceil(grid.total / grid.limit)) : 1
  const showColumn = (key: GridColumnKey): boolean => visibleColumns.includes(key)

  const statusOptions = PRODUCT_STATUS_ORDER.map((value) => ({
    value,
    label: PRODUCT_STATUS_LABELS[value],
  }))
  const brandSelectOptions = brandOptions.map((brand) => ({ value: brand.id, label: brand.name }))
  const categorySelectOptions = categoryOptions.map((category) => ({
    value: category.id,
    label: category.name,
  }))

  const chips: FilterChip[] = []
  if (grid.filters.search.trim()) {
    chips.push({
      key: 'q',
      label: `جستجو: ${grid.filters.search.trim()}`,
      onRemove: () => {
        setSearchInput('')
        setSearch('')
      },
    })
  }
  if (grid.filters.sku.trim()) {
    chips.push({
      key: 'sku',
      label: `SKU: ${grid.filters.sku.trim()}`,
      onRemove: () => {
        setSkuInput('')
        setSku('')
      },
    })
  }
  if (grid.filters.statuses.length > 0) {
    chips.push({
      key: 'status',
      label: `وضعیت: ${grid.filters.statuses.map((value) => PRODUCT_STATUS_LABELS[value]).join('، ')}`,
      onRemove: () => setStatuses([]),
    })
  }
  if (grid.filters.brandIds.length > 0) {
    const labels = grid.filters.brandIds
      .map((id) => brandSelectOptions.find((option) => option.value === id)?.label ?? id)
      .join('، ')
    chips.push({ key: 'brand', label: `برند: ${labels}`, onRemove: () => setBrandIds([]) })
  }
  if (grid.filters.categoryIds.length > 0) {
    const labels = grid.filters.categoryIds
      .map((id) => categorySelectOptions.find((option) => option.value === id)?.label ?? id)
      .join('، ')
    chips.push({ key: 'category', label: `دسته: ${labels}`, onRemove: () => setCategoryIds([]) })
  }
  if (grid.filters.priceStatus) {
    chips.push({
      key: 'pstatus',
      label: `وضعیت قیمت: ${GRID_STATUS_LABELS[grid.filters.priceStatus]}`,
      onRemove: () => setPriceStatus(''),
    })
  }
  if (grid.filters.condition) {
    chips.push({
      key: 'cond',
      label: `وضعیت کالا: ${PRODUCT_CONDITION_LABELS[grid.filters.condition]}`,
      onRemove: () => setCondition(''),
    })
  }
  if (grid.filters.stockStatus) {
    chips.push({
      key: 'stock',
      label: `موجودی: ${grid.filters.stockStatus === 'IN_STOCK' ? 'موجود' : 'ناموجود'}`,
      onRemove: () => setStockStatus(''),
    })
  }
  if (grid.filters.minPrice.trim() || grid.filters.maxPrice.trim()) {
    chips.push({
      key: 'price',
      label: `قیمت: ${grid.filters.minPrice || '۰'} تا ${grid.filters.maxPrice || '∞'}`,
      onRemove: () => {
        setMinPriceInput('')
        setMaxPriceInput('')
        setPriceRange('', '')
      },
    })
  }

  const clearAllFilters = (): void => {
    setSearchInput('')
    setSkuInput('')
    setMinPriceInput('')
    setMaxPriceInput('')
    grid.clearAllFilters()
  }

  const cellValue = (
    row: CatalogGridRow,
    field: 'price' | 'compareAtPrice' | 'stock' | 'sku' | 'barcode' | 'variantName',
  ): string => {
    const draft = drafts.drafts[row.variantId]
    if (field === 'price') {
      return draft?.price !== undefined ? groupMoneyDigits(draft.price) : groupMoneyDigits(row.price)
    }
    if (field === 'compareAtPrice') {
      const source =
        draft?.compareAtPrice !== undefined ? draft.compareAtPrice : row.compareAtPrice
      return source === null || source === undefined ? '' : groupMoneyDigits(source)
    }
    if (field === 'stock') {
      return draft?.stock ?? String(row.stock)
    }
    if (field === 'sku') {
      return draft?.sku ?? row.sku
    }
    if (field === 'barcode') {
      const source = draft?.barcode !== undefined ? draft.barcode : row.barcode
      return source ?? ''
    }
    const source = draft?.variantName !== undefined ? draft.variantName : row.variantName
    return source ?? ''
  }

  const cellError = (row: CatalogGridRow, field: string): string | undefined => {
    const rowErrors = drafts.errors[row.variantId]
    if (!rowErrors) return undefined
    return rowErrors[field] ?? rowErrors['_']
  }

  const serverValues = (row: CatalogGridRow) => ({
    variantId: row.variantId,
    expectedUpdatedAt: row.expectedUpdatedAt,
    sku: row.sku,
    barcode: row.barcode,
    variantName: row.variantName,
    price: row.price,
    compareAtPrice: row.compareAtPrice,
    stock: row.stock,
    priceStatus: row.priceStatus,
  })

  type EditableColumnKey =
    | 'variantName'
    | 'sku'
    | 'barcode'
    | 'stock'
    | 'regularPrice'
    | 'salePrice'
    | 'priceStatus'

  /** Column key → draft field (price columns are renamed in the draft model). */
  type CellField = 'price' | 'compareAtPrice' | 'stock' | 'sku' | 'barcode' | 'variantName'
  const EDIT_FIELD_BY_COLUMN: Record<Exclude<EditableColumnKey, 'priceStatus'>, CellField> = {
    variantName: 'variantName',
    sku: 'sku',
    barcode: 'barcode',
    stock: 'stock',
    regularPrice: 'price',
    salePrice: 'compareAtPrice',
  }

  const renderEditableColumn = (row: CatalogGridRow, column: EditableColumnKey) => {
    const status = drafts.statuses[row.variantId] ?? 'clean'
    // API fieldErrors are keyed by the draft field (compareAtPrice), not the column.
    const error = cellError(row, column === 'priceStatus' ? 'priceStatus' : EDIT_FIELD_BY_COLUMN[column])
    if (column === 'stock' && !row.stockEditable) {
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
    if (column === 'priceStatus') {
      return (
        <PriceStatusCell
          value={row.priceStatus}
          status={status}
          error={error}
          ariaLabel={`وضعیت قیمت — ${row.sku}`}
          onChange={(value) => drafts.editCell(serverValues(row), 'priceStatus', value)}
        />
      )
    }
    const kind =
      column === 'regularPrice'
        ? 'price'
        : column === 'salePrice'
          ? 'compareAtPrice'
          : column === 'stock'
            ? 'stock'
            : 'text'
    return (
      <EditableCell
        kind={kind}
        value={cellValue(row, EDIT_FIELD_BY_COLUMN[column])}
        status={status}
        error={error}
        ariaLabel={`${GRID_COLUMN_LABELS[column]} — ${row.sku}`}
        textDir={column === 'variantName' ? 'rtl' : 'ltr'}
        maxLength={column === 'sku' ? 64 : column === 'barcode' ? 64 : column === 'variantName' ? 255 : undefined}
        onChange={(value) => drafts.editCell(serverValues(row), EDIT_FIELD_BY_COLUMN[column], value)}
      />
    )
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="محصولات"
        subtitle="ویرایش سریع قیمت و موجودی؛ تغییرات با «ذخیره تغییرات» اعمال میشود."
        actions={
          <Button color="primary" onClick={() => navigate('/products/new')}>
            <Plus data-slot="icon" />
            افزودن محصول
          </Button>
        }
      />

      {/* SS-268 filter panel: collapsed below xl by default (the chips row
          below stays visible either way); expanded (or always visible)
          above xl. 2-column label+field grid with htmlFor/id — every
          control has a real label association (audit §A.7 fix). */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          outline
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-controls="products-filter-panel"
        >
          <SlidersHorizontal data-slot="icon" />
          فیلترها
          {chips.length > 0 ? (
            <span className="rounded-full bg-primary-subtle px-2 py-0.5 text-xs font-medium text-primary">
              {chips.length}
            </span>
          ) : null}
        </Button>
      </div>
      <div
        id="products-filter-panel"
        className={clsx(
          'grid gap-x-6 gap-y-4 sm:grid-cols-2',
          filtersOpen ? 'grid' : 'hidden xl:grid',
        )}
      >
        <Field className="sm:col-span-2">
          <Label htmlFor="filter-search">جستجو در همه فیلدها</Label>
          <Input
            id="filter-search"
            type="search"
            name="search"
            placeholder="نام محصول، برند، دسته‌بندی یا SKU…"
            maxLength={64}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </Field>
        <Field>
          <Label htmlFor="filter-sku">شناسه کالا (SKU)</Label>
          <Input
            id="filter-sku"
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
          <Label htmlFor="filter-min">محدوده قیمت (ریال)</Label>
          <div className="flex items-center gap-2">
            <Input
              id="filter-min"
              dir="ltr"
              name="min-price"
              placeholder="از"
              inputMode="numeric"
              value={minPriceInput}
              onChange={(event) => setMinPriceInput(event.target.value.replace(/[^\d]/g, ''))}
            />
            <Input
              id="filter-max"
              aria-label="حداکثر قیمت"
              dir="ltr"
              name="max-price"
              placeholder="تا"
              inputMode="numeric"
              value={maxPriceInput}
              onChange={(event) => setMaxPriceInput(event.target.value.replace(/[^\d]/g, ''))}
            />
          </div>
        </Field>
        <MultiSelectCheckbox
          label="برند"
          options={brandSelectOptions}
          selected={grid.filters.brandIds}
          onChange={(values) => changeFilter(() => setBrandIds(values))()}
        />
        <MultiSelectCheckbox
          label="دسته‌بندی"
          options={categorySelectOptions}
          selected={grid.filters.categoryIds}
          onChange={(values) => changeFilter(() => setCategoryIds(values))()}
        />
        <MultiSelectCheckbox
          label="وضعیت"
          options={statusOptions}
          selected={grid.filters.statuses}
          onChange={(values) => changeFilter(() => setStatuses(values as never))()}
        />
        <Field>
          <Label htmlFor="filter-price-status">وضعیت قیمت</Label>
          <Select
            id="filter-price-status"
            name="price-status"
            value={grid.filters.priceStatus}
            onChange={(event) =>
              changeFilter(() => setPriceStatus(event.target.value as never))()
            }
          >
            <option value="">همه</option>
            <option value="PRICED">{GRID_STATUS_LABELS.PRICED}</option>
            <option value="CALL_FOR_PRICE">{GRID_STATUS_LABELS.CALL_FOR_PRICE}</option>
          </Select>
        </Field>
        <Field>
          <Label htmlFor="filter-condition">وضعیت کالا</Label>
          <Select
            id="filter-condition"
            name="condition"
            value={grid.filters.condition}
            onChange={(event) =>
              changeFilter(() => setCondition(event.target.value as never))()
            }
          >
            <option value="">همه</option>
            {Object.entries(PRODUCT_CONDITION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label htmlFor="filter-stock-status">موجودی</Label>
          <Select
            id="filter-stock-status"
            name="stock-status"
            value={grid.filters.stockStatus}
            onChange={(event) =>
              changeFilter(() => setStockStatus(event.target.value as never))()
            }
          >
            <option value="">همه</option>
            <option value="IN_STOCK">موجود</option>
            <option value="OUT_OF_STOCK">ناموجود</option>
          </Select>
        </Field>
      </div>

      <FilterChips chips={chips} onClearAll={clearAllFilters} />

      <ColumnChips visible={visibleColumns} onToggle={toggleColumn} />

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

      {grid.loading && grid.rows.length === 0 ? (
        <Loading compact label="در حال بارگذاری…" />
      ) : grid.error && grid.rows.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-4 rounded-xl px-6 py-16 text-center">
          <p className="text-sm/6 text-muted">{translateApiError(grid.error)}</p>
          <Button color="primary" onClick={() => void grid.refetch()}>
            تلاش مجدد
          </Button>
        </div>
      ) : grid.rows.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title="محصولی یافت نشد"
          description={
            chips.length > 0
              ? 'با این فیلترها واریانتی ثبت نشده است.'
              : 'هنوز محصولی ثبت نشده است.'
          }
          actions={
            chips.length > 0 ? (
              <Button outline onClick={clearAllFilters}>
                حذف فیلترها
              </Button>
            ) : (
              <Button outline onClick={() => navigate('/products/new')}>
                افزودن محصول
              </Button>
            )
          }
        />
      ) : (
        <TableCard>
          <TablePagination
            position="top"
            page={grid.filters.page}
            totalPages={totalPages}
            total={grid.total}
            limit={grid.filters.limit}
            onPageChange={(target) => changeFilter(() => setPage(target))()}
            onLimitChange={(next) => changeFilter(() => setLimit(next))()}
            totalLabel="واریانت"
          />
          <HorizontalScroll dragToPan>
            <Table striped dense scrollContainer={false}>
              <TableHead>
                <TableRow>
                  {showColumn('thumbnail') && <TableHeader>تصویر</TableHeader>}
                  <TableHeader>
                    <SortableHeader
                      label={GRID_COLUMN_LABELS.name}
                      field="name"
                      sortBy={grid.filters.sortBy}
                      sortDir={grid.filters.sortDir}
                      onSort={(field) => changeFilter(() => setSort(field))()}
                    />
                  </TableHeader>
                  {showColumn('variantName') && <TableHeader>{GRID_COLUMN_LABELS.variantName}</TableHeader>}
                  <TableHeader>
                    <SortableHeader
                      label={GRID_COLUMN_LABELS.sku}
                      field="sku"
                      sortBy={grid.filters.sortBy}
                      sortDir={grid.filters.sortDir}
                      onSort={(field) => changeFilter(() => setSort(field))()}
                    />
                  </TableHeader>
                  {showColumn('barcode') && <TableHeader>{GRID_COLUMN_LABELS.barcode}</TableHeader>}
                  {showColumn('brand') && <TableHeader>{GRID_COLUMN_LABELS.brand}</TableHeader>}
                  {showColumn('category') && <TableHeader>{GRID_COLUMN_LABELS.category}</TableHeader>}
                  <TableHeader>
                    <SortableHeader
                      label={GRID_COLUMN_LABELS.stock}
                      field="stock"
                      sortBy={grid.filters.sortBy}
                      sortDir={grid.filters.sortDir}
                      onSort={(field) => changeFilter(() => setSort(field))()}
                    />
                  </TableHeader>
                  <TableHeader>
                    <SortableHeader
                      label={GRID_COLUMN_LABELS.regularPrice}
                      field="price"
                      sortBy={grid.filters.sortBy}
                      sortDir={grid.filters.sortDir}
                      onSort={(field) => changeFilter(() => setSort(field))()}
                    />
                  </TableHeader>
                  <TableHeader>
                    <SortableHeader
                      label={GRID_COLUMN_LABELS.salePrice}
                      field="compareAtPrice"
                      sortBy={grid.filters.sortBy}
                      sortDir={grid.filters.sortDir}
                      onSort={(field) => changeFilter(() => setSort(field))()}
                    />
                  </TableHeader>
                  {showColumn('priceStatus') && <TableHeader>{GRID_COLUMN_LABELS.priceStatus}</TableHeader>}
                  {showColumn('productStatus') && <TableHeader>{GRID_COLUMN_LABELS.productStatus}</TableHeader>}
                  {showColumn('condition') && <TableHeader>{GRID_COLUMN_LABELS.condition}</TableHeader>}
                  {showColumn('created') && (
                    <TableHeader>
                      <SortableHeader
                        label={GRID_COLUMN_LABELS.created}
                        field="createdAt"
                        sortBy={grid.filters.sortBy}
                        sortDir={grid.filters.sortDir}
                        onSort={(field) => changeFilter(() => setSort(field))()}
                      />
                    </TableHeader>
                  )}
                  <TableHeader>عملیات</TableHeader>
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
                              width={40}
                              height={40}
                              loading="lazy"
                              decoding="async"
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
                      {showColumn('variantName') && (
                        <TableCell>{renderEditableColumn(row, 'variantName')}</TableCell>
                      )}
                      <TableCell>{renderEditableColumn(row, 'sku')}</TableCell>
                      {showColumn('barcode') && (
                        <TableCell>{renderEditableColumn(row, 'barcode')}</TableCell>
                      )}
                      {showColumn('brand') && (
                        <TableCell className="text-muted">{row.brandName ?? 'بدون برند'}</TableCell>
                      )}
                      {showColumn('category') && (
                        <TableCell className="text-muted">{row.categoryName}</TableCell>
                      )}
                      <TableCell>{renderEditableColumn(row, 'stock')}</TableCell>
                      <TableCell>{renderEditableColumn(row, 'regularPrice')}</TableCell>
                      <TableCell>{renderEditableColumn(row, 'salePrice')}</TableCell>
                      {showColumn('priceStatus') && (
                        <TableCell>{renderEditableColumn(row, 'priceStatus')}</TableCell>
                      )}
                      {showColumn('productStatus') && (
                        <TableCell className="text-muted">
                          {PRODUCT_STATUS_LABELS[row.productStatus]}
                        </TableCell>
                      )}
                      {showColumn('condition') && (
                        <TableCell className="text-muted">
                          {PRODUCT_CONDITION_LABELS[row.condition]}
                        </TableCell>
                      )}
                      {showColumn('created') && (
                        <TableCell className="text-muted">{formatDate(row.createdAt)}</TableCell>
                      )}
                      <TableCell>
                        <RowActions
                          productId={row.productId}
                          productName={row.productName}
                          sku={row.sku}
                          onDelete={() => setDeleteTarget({ variantId: row.variantId, sku: row.sku })}
                        />
                        {status === 'conflict-changed' ? (
                          <button
                            type="button"
                            className="mt-1 block text-xs font-medium text-primary hover:underline"
                            onClick={() =>
                              setConflictQueue([{ variantId: row.variantId, outcome: 'CONFLICT_CHANGED' }])
                            }
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
          </HorizontalScroll>

          <TablePagination
            position="bottom"
            className="mt-4"
            page={grid.filters.page}
            totalPages={totalPages}
            total={grid.total}
            limit={grid.filters.limit}
            onPageChange={(target) => changeFilter(() => setPage(target))()}
            onLimitChange={(next) => changeFilter(() => setLimit(next))()}
            totalLabel="واریانت"
          />
        </TableCard>
      )}

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        title="حذف واریانت"
        description={
          deleteTarget
            ? `واریانت «${deleteTarget.sku}» حذف میشود. این عملیات قابل بازگشت نیست.`
            : ''
        }
        confirmLabel="حذف واریانت"
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

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
