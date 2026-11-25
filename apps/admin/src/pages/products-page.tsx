import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  Coins,
  Package,
  Percent,
  Plus,
  SlidersHorizontal,
  Tags,
} from 'lucide-react'
import type {
  CatalogGridRow,
  CatalogGridRowResult,
  CatalogGridSortField,
  PricingScope,
} from '@sabz/types'
import { useCatalogGrid } from '../hooks/use-catalog-grid'
import { useCatalogDrafts } from '../hooks/use-catalog-drafts'
import { useCategoryOptions } from '../hooks/use-category-options'
import { useBrandOptions } from '../hooks/use-brand-options'
import { deleteVariant } from '../services/variants'
import { listCatalogGridIds } from '../services/catalog-grid'
import { translateApiError } from '../lib/error-messages'
import { formatDate, formatDateTime, formatFaNumber } from '../lib/format'
import { adminMediaUrl } from '../lib/media-url'
import { groupMoneyDigits } from '../lib/money-input'
import { storefrontProductUrl } from '../lib/storefront-url'
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
import { ErrorState } from '../components/ui/error-state'
import { PageHeader } from '../components/ui/page-header'
import { TableCard } from '../components/ui/table-card'
import { TablePagination } from '../components/ui/table-pagination'
import { MultiSelectCheckbox } from '../components/ui/multi-select-checkbox'
import { DeleteConfirmDialog } from '../components/ui/delete-confirm-dialog'
import { EditableCell, PriceStatusCell } from '../components/catalog/editable-cell'
import { EntityCell } from '../components/catalog/entity-cell'
import { FilterChips } from '../components/catalog/filter-chips'
import type { FilterChip } from '../components/catalog/filter-chips'
import { RowActions } from '../components/catalog/row-actions'
import { UnsavedChangesBar } from '../components/catalog/unsaved-changes-bar'
import { ColumnChips } from '../components/catalog/column-chips'
import { HorizontalScroll } from '../components/ui/horizontal-scroll'
import { RowConflictDialog } from '../components/catalog/row-conflict-dialog'
import { BulkAttributesDialog } from '../components/products/bulk-attributes-dialog'
import { BulkPriceDialog } from '../components/products/bulk-price-dialog'
import { SaleScheduleDialog } from '../components/products/sale-schedule-dialog'
import { PricingWorkspace } from '../components/products/pricing-workspace'

const SEARCH_DEBOUNCE_MS = 300

const DIRTY_GUARD_MESSAGE = 'تغییرات ذخیرهنشده دارید؛ با ادامه این تغییرات از بین میروند. ادامه میدهید؟'

/** SS-270: «ستون دارای تغییر ذخیره‌نشده» marker (never color alone). */
function PendingDot() {
  return (
    <span
      aria-hidden="true"
      title="ستون دارای تغییر ذخیرهنشده"
      className="size-1.5 rounded-full bg-warning"
    />
  )
}

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
  // SS-268 redesign: the sort affordance is quiet until relevant — inactive
  // columns reveal the two-arrow glyph only on hover; the active column
  // speaks in the primary ink with a single directional arrow.
  const active = sortBy === field
  return (
    <button
      type="button"
      aria-label={active ? `${label} — مرتب‌سازی ${sortDir === 'asc' ? 'صعودی' : 'نزولی'}` : undefined}
      className={clsx(
        'group inline-flex items-center gap-1.5 text-xs font-semibold transition-colors',
        active ? 'text-primary' : 'text-muted hover:text-foreground',
      )}
      onClick={() => onSort(field)}
    >
      {label}
      <span
        className={clsx(
          'transition-opacity',
          active ? 'text-primary opacity-100' : 'opacity-0 group-hover:opacity-50',
        )}
        aria-hidden
      >
        {active && sortDir === 'asc' ? (
          <ArrowUp className="size-3.5" />
        ) : active ? (
          <ArrowDown className="size-3.5" />
        ) : (
          <ArrowUpDown className="size-3.5" />
        )}
      </span>
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
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'rules' ? 'rules' : 'grid'
  const setView = (next: 'grid' | 'rules'): void => {
    const params = new URLSearchParams(searchParams)
    if (next === 'rules') params.set('view', 'rules')
    else params.delete('view')
    setSearchParams(params, { replace: true })
  }
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
  const [selectedProducts, setSelectedProducts] = useState<
    Map<string, { id: string; name: string; updatedAt: string }>
  >(new Map())
  const [bulkAttributesOpen, setBulkAttributesOpen] = useState(false)
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false)
  const [bulkPriceMode, setBulkPriceMode] = useState<'discount' | 'override'>('discount')
  const [allFilteredBusy, setAllFilteredBusy] = useState(false)
  const [scheduleTarget, setScheduleTarget] = useState<CatalogGridRow | null>(null)

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
        regularPrice: result.regularPrice ?? '',
        discountedPrice: result.discountedPrice ?? null,
        discountStartsAt: result.discountStartsAt,
        discountEndsAt: result.discountEndsAt,
        partnerPrice: result.partnerPrice,
        priceUpdatedAt: result.priceUpdatedAt,
        effectivePrice: result.effectivePrice,
        expectedUpdatedAt: result.updatedAt ?? '',
        stock: result.stock,
        sku: result.sku,
        barcode: result.barcode,
        variantName: result.variantName,
        priceStatus: result.priceStatus,
        product: result.product,
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

  // SS-270: Ctrl/Cmd+S triggers the explicit batch save.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (drafts.hasDirty && !drafts.saving) {
          void handleSave()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drafts.hasDirty, drafts.saving, handleSave])

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

  const visibleProducts = Array.from(
    new Map(grid.rows.map((row) => [row.productId, row])).values(),
  )
  const allVisibleSelected =
    visibleProducts.length > 0 &&
    visibleProducts.every((row) => selectedProducts.has(row.productId))

  function toggleProductSelection(row: CatalogGridRow): void {
    setSelectedProducts((current) => {
      const next = new Map(current)
      if (next.has(row.productId)) {
        next.delete(row.productId)
      } else {
        next.set(row.productId, {
          id: row.productId,
          name: row.productName,
          updatedAt: row.productUpdatedAt,
        })
      }
      return next
    })
  }

  function toggleAllVisible(): void {
    setSelectedProducts((current) => {
      if (allVisibleSelected) {
        const next = new Map(current)
        for (const row of visibleProducts) next.delete(row.productId)
        return next
      }
      const next = new Map(current)
      for (const row of visibleProducts) {
        next.set(row.productId, {
          id: row.productId,
          name: row.productName,
          updatedAt: row.productUpdatedAt,
        })
      }
      return next
    })
  }

  /**
   * Select every product matching the current server-side filters — not just
   * the visible page. The server returns distinct ids and tells us when its
   * cap truncated the set, so the UI never claims an incomplete selection.
   */
  async function selectAllFiltered(): Promise<void> {
    setAllFilteredBusy(true)
    try {
      const result = await listCatalogGridIds({
        search: grid.filters.search.trim() || undefined,
        sku: grid.filters.sku.trim() || undefined,
        statuses: grid.filters.statuses.length > 0 ? grid.filters.statuses : undefined,
        categoryIds:
          grid.filters.categoryIds.length > 0 ? grid.filters.categoryIds : undefined,
        brandIds: grid.filters.brandIds.length > 0 ? grid.filters.brandIds : undefined,
        priceStatus: grid.filters.priceStatus || undefined,
        condition: grid.filters.condition || undefined,
        minPrice: grid.filters.minPrice.trim() || undefined,
        maxPrice: grid.filters.maxPrice.trim() || undefined,
        stockStatus: grid.filters.stockStatus || undefined,
      })
      setSelectedProducts((current) => {
        const next = new Map(current)
        for (const id of result.productIds) {
          const row = grid.rows.find((item) => item.productId === id)
          next.set(id, {
            id,
            name: row?.productName ?? id,
            updatedAt: row?.productUpdatedAt ?? '',
          })
        }
        return next
      })
      if (result.truncated) {
        window.alert(
          'تعداد نتایج بیش از سقف انتخاب گروهی است؛ فقط بخشی از محصولات انتخاب شد. فیلترها را محدودتر کنید.',
        )
      }
    } catch (error) {
      window.alert(translateApiError(error))
    } finally {
      setAllFilteredBusy(false)
    }
  }

  const selectionScope = useMemo<PricingScope>(
    () => ({ type: 'PRODUCTS', productIds: [...selectedProducts.keys()] }),
    [selectedProducts],
  )

  const singleSelectedCategory =
    grid.filters.categoryIds.length === 1 ? grid.filters.categoryIds[0]! : null

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

  type CellField =
    | 'price'
    | 'discountedPrice'
    | 'partnerPrice'
    | 'aedPrice'
    | 'usdPrice'
    | 'stock'
    | 'sku'
    | 'barcode'
    | 'variantName'

  const cellValue = (row: CatalogGridRow, field: CellField): string => {
    const draft = drafts.drafts[row.variantId]
    if (field === 'price') {
      return groupMoneyDigits(
        draft?.price !== undefined ? draft.price : row.regularPrice,
      )
    }
    if (field === 'discountedPrice') {
      const source =
        draft?.discountedPrice !== undefined
          ? draft.discountedPrice
          : row.discountedPrice
      return source === null || source === undefined ? '' : groupMoneyDigits(source)
    }
    if (field === 'partnerPrice') {
      const source =
        draft?.partnerPrice !== undefined ? draft.partnerPrice : row.partnerPrice
      return source === null || source === undefined ? '' : groupMoneyDigits(source)
    }
    if (field === 'aedPrice') {
      const source = draft?.aedPrice !== undefined ? draft.aedPrice : row.aedPrice
      return source === null || source === undefined ? '' : groupMoneyDigits(source)
    }
    if (field === 'usdPrice') {
      const source = draft?.usdPrice !== undefined ? draft.usdPrice : row.usdPrice
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

  const serverProduct = (row: CatalogGridRow) => ({
    productId: row.productId,
    productName: row.productName,
    brandId: row.brandId,
    categoryId: row.categoryId,
    productUpdatedAt: row.productUpdatedAt,
  })
  const productCellStatus = (row: CatalogGridRow): string =>
    drafts.productDrafts[row.productId] !== undefined ? 'dirty' : 'clean'
  const productNameValue = (row: CatalogGridRow): string =>
    drafts.productDrafts[row.productId]?.productName ?? row.productName
  const brandValue = (row: CatalogGridRow): string | null =>
    drafts.productDrafts[row.productId]?.brandId ?? row.brandId
  const categoryValue = (row: CatalogGridRow): string =>
    drafts.productDrafts[row.productId]?.categoryId ?? row.categoryId
  const productFieldPending = (field: 'productName' | 'brandId' | 'categoryId'): boolean =>
    Object.values(drafts.productDrafts).some((draft) => draft[field] !== undefined)

  const serverValues = (row: CatalogGridRow) => ({
    variantId: row.variantId,
    expectedUpdatedAt: row.expectedUpdatedAt,
    sku: row.sku,
    barcode: row.barcode,
    variantName: row.variantName,
    price: row.regularPrice,
    discountedPrice: row.discountedPrice,
    discountStartsAt: row.discountStartsAt,
    discountEndsAt: row.discountEndsAt,
    partnerPrice: row.partnerPrice,
    aedPrice: row.aedPrice,
    usdPrice: row.usdPrice,
    stock: row.stock,
    priceStatus: row.priceStatus,
  })

  type EditableColumnKey =
    | 'variantName'
    | 'sku'
    | 'barcode'
    | 'stock'
    | 'regularPrice'
    | 'discountedPrice'
    | 'partnerPrice'
    | 'aedPrice'
    | 'usdPrice'
    | 'priceStatus'

  const EDIT_FIELD_BY_COLUMN: Record<Exclude<EditableColumnKey, 'priceStatus'>, CellField> = {
    variantName: 'variantName',
    sku: 'sku',
    barcode: 'barcode',
    stock: 'stock',
    regularPrice: 'price',
    discountedPrice: 'discountedPrice',
    partnerPrice: 'partnerPrice',
    aedPrice: 'aedPrice',
    usdPrice: 'usdPrice',
  }

  const renderEditableColumn = (row: CatalogGridRow, column: EditableColumnKey) => {
    const status = drafts.statuses[row.variantId] ?? 'clean'
    const error = cellError(
      row,
      column === 'priceStatus' ? 'priceStatus' : EDIT_FIELD_BY_COLUMN[column],
    )
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
      column === 'regularPrice' ||
      column === 'discountedPrice' ||
      column === 'partnerPrice' ||
      column === 'aedPrice' ||
      column === 'usdPrice'
        ? 'price'
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
        maxLength={
          column === 'sku' ? 64 : column === 'barcode' ? 64 : column === 'variantName' ? 255 : undefined
        }
        onChange={(value) =>
          drafts.editCell(serverValues(row), EDIT_FIELD_BY_COLUMN[column], value)
        }
      />
    )
  }

  const priceSourceLabel: Record<string, string> = {
    REGULAR: 'قیمت عادی',
    SALE: 'فروش ویژه',
    CATEGORY_RULE: 'قانون دسته‌بندی',
    OVERRIDE: 'اورراید محصول',
    PARTNER_TIER: 'پله همکاری',
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="محصولات و قیمت‌گذاری"
        subtitle="شبکه ویرایش سریع قیمت/موجودی و تمام قوانین قیمت‌گذاری، در یک فضای کاری."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button color="primary" onClick={() => navigate('/products/new')}>
              <Plus data-slot="icon" />
              افزودن محصول
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="فضای کاری محصولات">
        {view === 'grid' ? (
          <Button color="primary" role="tab" aria-selected="true" onClick={() => setView('grid')}>
            <Package data-slot="icon" />
            شبکه محصولات
          </Button>
        ) : (
          <Button plain role="tab" aria-selected="false" onClick={() => setView('grid')}>
            <Package data-slot="icon" />
            شبکه محصولات
          </Button>
        )}
        {view === 'rules' ? (
          <Button color="primary" role="tab" aria-selected="true" onClick={() => setView('rules')}>
            <Percent data-slot="icon" />
            قوانین، پروموشن‌ها و پله‌ها
          </Button>
        ) : (
          <Button plain role="tab" aria-selected="false" onClick={() => setView('rules')}>
            <Percent data-slot="icon" />
            قوانین، پروموشن‌ها و پله‌ها
          </Button>
        )}
      </div>

      {view === 'rules' ? (
        <PricingWorkspace embedded />
      ) : (
        <>

      {/* SS-268 filter panel: collapsed below xl by default (the chips row
          below stays visible either way); expanded (or always visible)
          above xl. 2-column label+field grid with htmlFor/id — every
          control has a real label association (audit §A.7 fix).
          The toggle is mobile/tablet-only: above xl the panel is always
          visible, so leaving the button there would be a dead control that
          also lies about `aria-expanded`. */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          outline
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-controls="products-filter-panel"
          className="xl:hidden"
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
          'grid gap-x-6 gap-y-3 rounded-xl border border-border bg-surface-strong p-4 sm:grid-cols-2',
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface-strong px-4 py-3">
        <p className="text-sm text-muted">
          {selectedProducts.size > 0 ? (
            <span className="font-semibold text-foreground">
              {formatFaNumber(selectedProducts.size)} محصول انتخاب شده است
            </span>
          ) : (
            'برای عملیات گروهی، محصولات را انتخاب کنید.'
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button outline onClick={() => void selectAllFiltered()} disabled={allFilteredBusy}>
            {allFilteredBusy ? 'در حال انتخاب…' : 'انتخاب همه نتایج فیلتر'}
          </Button>
          {selectedProducts.size > 0 && (
            <>
              <Button outline onClick={() => setSelectedProducts(new Map())}>
                پاک کردن انتخاب
              </Button>
              <Button
                outline
                onClick={() => {
                  setBulkPriceMode('discount')
                  setBulkPriceOpen(true)
                }}
              >
                <Percent data-slot="icon" />
                تخفیف گروهی
              </Button>
              <Button
                outline
                onClick={() => {
                  setBulkPriceMode('override')
                  setBulkPriceOpen(true)
                }}
              >
                <Coins data-slot="icon" />
                اورراید قیمت
              </Button>
              <Button onClick={() => setBulkAttributesOpen(true)}>
                ویرایش گروهی ویژگی‌ها
              </Button>
            </>
          )}
          {singleSelectedCategory && (
            <Button outline onClick={() => setView('rules')}>
              قانون دسته‌بندی
            </Button>
          )}
        </div>
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

      {grid.loading && grid.rows.length === 0 ? (
        <Loading compact label="در حال بارگذاری…" />
      ) : grid.error && grid.rows.length === 0 ? (
        <ErrorState message={translateApiError(grid.error)} onRetry={() => void grid.refetch()} />
      ) : grid.rows.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title="محصولی یافت نشد"
          description={
            chips.length > 0
              ? 'با این فیلترها نوعی ثبت نشده است.'
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
            disabled={grid.loading}
            totalLabel="نوع"
          />
          <HorizontalScroll dragToPan>
            <Table dense scrollContainer={false}>
          {/* SS-268 table redesign: hairline row borders + row hover instead
              of zebra bands; the header sits on a raised band. */}
          <TableHead className="[&_th]:bg-surface-strong">
            <TableRow>
                  <TableHeader className="w-10">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      aria-label="انتخاب همه محصولات این صفحه"
                      className="size-4 accent-primary"
                    />
                  </TableHeader>
                  {showColumn('thumbnail') && <TableHeader>تصویر</TableHeader>}
                  <TableHeader>
                    <span className="inline-flex items-center gap-1.5">
                      <SortableHeader
                        label={GRID_COLUMN_LABELS.name}
                        field="name"
                        sortBy={grid.filters.sortBy}
                        sortDir={grid.filters.sortDir}
                        onSort={(field) => changeFilter(() => setSort(field))()}
                      />
                      {productFieldPending('productName') && <PendingDot />}
                    </span>
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
                  {showColumn('brand') && (
                    <TableHeader>
                      <span className="inline-flex items-center gap-1.5">
                        {GRID_COLUMN_LABELS.brand}
                        {productFieldPending('brandId') && <PendingDot />}
                      </span>
                    </TableHeader>
                  )}
                  {showColumn('category') && (
                    <TableHeader>
                      <span className="inline-flex items-center gap-1.5">
                        {GRID_COLUMN_LABELS.category}
                        {productFieldPending('categoryId') && <PendingDot />}
                      </span>
                    </TableHeader>
                  )}
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
                      label={GRID_COLUMN_LABELS.discountedPrice}
                      field="discountedPrice"
                      sortBy={grid.filters.sortBy}
                      sortDir={grid.filters.sortDir}
                      onSort={(field) => changeFilter(() => setSort(field))()}
                    />
                  </TableHeader>
                  {showColumn('discountWindow') && (
                    <TableHeader>{GRID_COLUMN_LABELS.discountWindow}</TableHeader>
                  )}
                  {showColumn('aedPrice') && (
                    <TableHeader>{GRID_COLUMN_LABELS.aedPrice}</TableHeader>
                  )}
                  {showColumn('usdPrice') && (
                    <TableHeader>{GRID_COLUMN_LABELS.usdPrice}</TableHeader>
                  )}
                  {showColumn('partnerPrice') && (
                    <TableHeader>{GRID_COLUMN_LABELS.partnerPrice}</TableHeader>
                  )}
                  <TableHeader>{GRID_COLUMN_LABELS.effectivePrice}</TableHeader>
                  <TableHeader>{GRID_COLUMN_LABELS.priceUpdatedAt}</TableHeader>
                  {showColumn('storefrontLink') && (
                    <TableHeader>{GRID_COLUMN_LABELS.storefrontLink}</TableHeader>
                  )}
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
                    <TableRow key={row.variantId} className="transition-colors hover:bg-primary-subtle/40">
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedProducts.has(row.productId)}
                          onChange={() => toggleProductSelection(row)}
                          aria-label={`انتخاب ${row.productName}`}
                          className="size-4 accent-primary"
                        />
                      </TableCell>
                      {showColumn('thumbnail') && (
                        <TableCell>
                          {row.thumbnailUrl ? (
                            <img
                              src={adminMediaUrl(row.thumbnailUrl) ?? undefined}
                              alt=""
                              width={40}
                              height={40}
                              loading="lazy"
                              decoding="async"
                              className="size-10 rounded-md border border-border bg-transparent object-contain p-0.5"
                            />
                          ) : (
                            <div className="flex size-10 items-center justify-center rounded-lg bg-primary-subtle/50 text-primary/60">
                              <Package className="size-4" aria-hidden />
                            </div>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="font-medium text-foreground">
                        <EditableCell
                          kind="text"
                          textDir="rtl"
                          value={productNameValue(row)}
                          status={productCellStatus(row)}
                          error={cellError(row, 'productName')}
                          ariaLabel={`نام محصول — ${row.sku}`}
                          maxLength={255}
                          onChange={(value) =>
                            drafts.editProductCell(
                              serverProduct(row),
                              row.variantId,
                              row.productUpdatedAt,
                              'productName',
                              value,
                            )
                          }
                        />
                      </TableCell>
                      {showColumn('variantName') && (
                        <TableCell>{renderEditableColumn(row, 'variantName')}</TableCell>
                      )}
                      <TableCell>{renderEditableColumn(row, 'sku')}</TableCell>
                      {showColumn('barcode') && (
                        <TableCell>{renderEditableColumn(row, 'barcode')}</TableCell>
                      )}
                      {showColumn('brand') && (
                        <TableCell>
                          <EntityCell
                            ariaLabel={`برند — ${row.sku}`}
                            value={brandValue(row)}
                            options={brandSelectOptions}
                            nullable
                            clearLabel="بدون برند"
                            status={productCellStatus(row)}
                            error={cellError(row, 'brandId')}
                            onChange={(id) =>
                              drafts.editProductCell(
                                serverProduct(row),
                                row.variantId,
                                row.productUpdatedAt,
                                'brandId',
                                id ?? '',
                              )
                            }
                          />
                        </TableCell>
                      )}
                      {showColumn('category') && (
                        <TableCell>
                          <EntityCell
                            ariaLabel={`دسته‌بندی — ${row.sku}`}
                            value={categoryValue(row)}
                            options={categorySelectOptions}
                            status={productCellStatus(row)}
                            error={cellError(row, 'categoryId')}
                            onChange={(id) =>
                              drafts.editProductCell(
                                serverProduct(row),
                                row.variantId,
                                row.productUpdatedAt,
                                'categoryId',
                                id ?? '',
                              )
                            }
                          />
                        </TableCell>
                      )}
                      <TableCell>{renderEditableColumn(row, 'stock')}</TableCell>
                      <TableCell>{renderEditableColumn(row, 'regularPrice')}</TableCell>
                      <TableCell>{renderEditableColumn(row, 'discountedPrice')}</TableCell>
                      {showColumn('discountWindow') && (
                        <TableCell>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            onClick={() => setScheduleTarget(row)}
                          >
                            <CalendarClock className="size-3.5" aria-hidden />
                            {row.discountStartsAt || row.discountEndsAt
                              ? `${formatDateTime(row.discountStartsAt)} تا ${formatDateTime(row.discountEndsAt)}`
                              : 'زمان‌بندی'}
                          </button>
                        </TableCell>
                      )}
                      {showColumn('aedPrice') && (
                        <TableCell>{renderEditableColumn(row, 'aedPrice')}</TableCell>
                      )}
                      {showColumn('usdPrice') && (
                        <TableCell>{renderEditableColumn(row, 'usdPrice')}</TableCell>
                      )}
                      {showColumn('partnerPrice') && (
                        <TableCell>{renderEditableColumn(row, 'partnerPrice')}</TableCell>
                      )}
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span dir="ltr" className="tabular-nums text-sm text-foreground">
                            {row.effectivePrice ? groupMoneyDigits(row.effectivePrice) : '—'}
                          </span>
                          {row.priceSource ? (
                            <span className="text-[11px] text-muted">
                              {priceSourceLabel[row.priceSource] ?? row.priceSource}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted">
                        {row.priceUpdatedAt ? formatDateTime(row.priceUpdatedAt) : '—'}
                      </TableCell>
                      {showColumn('storefrontLink') && (
                        <TableCell>
                          {row.productStatus === 'PUBLISHED' ? (
                            <a
                              href={storefrontProductUrl(row.productSlug)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <Tags className="size-3.5" aria-hidden />
                              مشاهده
                            </a>
                          ) : (
                            <span className="text-xs text-muted">منتشر نشده</span>
                          )}
                        </TableCell>
                      )}
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
                          productSlug={row.productSlug}
                          productStatus={row.productStatus}
                          sku={row.sku}
                          onDelete={() => setDeleteTarget({ variantId: row.variantId, sku: row.sku })}
                          onOverride={() => {
                            setSelectedProducts(
                              new Map([
                                [
                                  row.productId,
                                  {
                                    id: row.productId,
                                    name: row.productName,
                                    updatedAt: row.productUpdatedAt,
                                  },
                                ],
                              ]),
                            )
                            setBulkPriceMode('override')
                            setBulkPriceOpen(true)
                          }}
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
            disabled={grid.loading}
            totalLabel="نوع"
          />
        </TableCard>
      )}

      <BulkAttributesDialog
        open={bulkAttributesOpen}
        products={[...selectedProducts.values()]}
        onClose={() => setBulkAttributesOpen(false)}
        onApplied={() => {
          void grid.refetch()
          setSelectedProducts(new Map())
        }}
      />

      <BulkPriceDialog
        open={bulkPriceOpen}
        mode={bulkPriceMode}
        scope={selectionScope}
        selectionCount={selectedProducts.size}
        onClose={() => setBulkPriceOpen(false)}
        onApplied={() => {
          setSelectedProducts(new Map())
          void grid.refetch()
        }}
      />

      <SaleScheduleDialog
        row={scheduleTarget}
        onClose={() => setScheduleTarget(null)}
        onSaved={() => {
          setScheduleTarget(null)
          void grid.refetch()
        }}
      />

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        title="حذف نوع"
        description={
          deleteTarget
            ? `نوع «${deleteTarget.sku}» حذف میشود. این عملیات قابل بازگشت نیست.`
            : ''
        }
        confirmLabel="حذف نوع"
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      <RowConflictDialog
        result={conflictResult}
        serverPrice={conflictRow ? groupMoneyDigits(conflictRow.regularPrice) : null}
        serverCompareAt={
          conflictRow?.discountedPrice
            ? groupMoneyDigits(conflictRow.discountedPrice)
            : null
        }
        serverStock={conflictRow ? conflictRow.stock : null}
        onKeepDraft={() => resolveConflict('keep')}
        onDropDraft={() => resolveConflict('drop')}
        onClose={() => setConflictQueue([])}
      />
        </>
      )}
    </div>
  )
}
