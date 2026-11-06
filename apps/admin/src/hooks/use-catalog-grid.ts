import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type {
  CatalogGridListResponse,
  CatalogGridRow,
  CatalogGridSortField,
  PriceStatus,
  ProductCondition,
  ProductStatus,
} from '@sabz/types'
import { listCatalogGrid } from '../services/catalog-grid'

/**
 * Server-paginated catalog grid rows with URL-driven filter state (SS-257
 * rework). The URL search params are the single source of truth — every
 * filter/sort/page change is a `replace` navigation, so filtered views are
 * shareable and the browser back button leaves the page instead of stepping
 * through keystrokes.
 */

export interface CatalogGridFilters {
  search: string
  sku: string
  statuses: ProductStatus[]
  categoryIds: string[]
  brandIds: string[]
  priceStatus: PriceStatus | ''
  condition: ProductCondition | ''
  minPrice: string
  maxPrice: string
  stockStatus: '' | 'IN_STOCK' | 'OUT_OF_STOCK'
  sortBy: CatalogGridSortField | ''
  sortDir: 'asc' | 'desc'
  page: number
}

export type CatalogGridFilterPatch = Partial<Omit<CatalogGridFilters, 'page'>> & {
  page?: number
}

/** Server-side patch of a saved row (authoritative values from the batch response). */
export interface CatalogGridRowPatch {
  variantId: string
  price: string
  compareAtPrice: string | null
  expectedUpdatedAt: string
  stock?: number
  sku?: string
  barcode?: string | null
  variantName?: string | null
  priceStatus?: PriceStatus
}

const DEFAULT_LIMIT = 50

function csv(value: string | null): string[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

function parseFilters(params: URLSearchParams): CatalogGridFilters {
  const pageRaw = Number.parseInt(params.get('page') ?? '1', 10)
  return {
    search: params.get('q') ?? '',
    sku: params.get('sku') ?? '',
    statuses: csv(params.get('status')) as ProductStatus[],
    categoryIds: csv(params.get('category')),
    brandIds: csv(params.get('brand')),
    priceStatus: (params.get('pstatus') ?? '') as PriceStatus | '',
    condition: (params.get('cond') ?? '') as ProductCondition | '',
    minPrice: params.get('min') ?? '',
    maxPrice: params.get('max') ?? '',
    stockStatus: (params.get('stock') ?? '') as CatalogGridFilters['stockStatus'],
    sortBy: (params.get('sort') ?? '') as CatalogGridSortField | '',
    sortDir: params.get('dir') === 'desc' ? 'desc' : 'asc',
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
  }
}

function serializeFilters(filters: CatalogGridFilters): URLSearchParams {
  const next = new URLSearchParams()
  if (filters.search.trim()) {
    next.set('q', filters.search.trim())
  }
  if (filters.sku.trim()) {
    next.set('sku', filters.sku.trim())
  }
  if (filters.statuses.length > 0) {
    next.set('status', filters.statuses.join(','))
  }
  if (filters.categoryIds.length > 0) {
    next.set('category', filters.categoryIds.join(','))
  }
  if (filters.brandIds.length > 0) {
    next.set('brand', filters.brandIds.join(','))
  }
  if (filters.priceStatus) {
    next.set('pstatus', filters.priceStatus)
  }
  if (filters.condition) {
    next.set('cond', filters.condition)
  }
  if (filters.minPrice.trim()) {
    next.set('min', filters.minPrice.trim())
  }
  if (filters.maxPrice.trim()) {
    next.set('max', filters.maxPrice.trim())
  }
  if (filters.stockStatus) {
    next.set('stock', filters.stockStatus)
  }
  if (filters.sortBy) {
    next.set('sort', filters.sortBy)
    next.set('dir', filters.sortDir)
  }
  if (filters.page > 1) {
    next.set('page', String(filters.page))
  }
  return next
}

export function useCatalogGrid() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = parseFilters(searchParams)
  const [result, setResult] = useState<CatalogGridListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const setFilters = useCallback(
    (patch: CatalogGridFilterPatch): void => {
      setSearchParams(
        serializeFilters({ ...parseFilters(searchParams), ...patch }),
        { replace: true },
      )
    },
    [searchParams, setSearchParams],
  )

  const setSearch = useCallback(
    (search: string) => setFilters({ search, page: 1 }),
    [setFilters],
  )

  const setSku = useCallback((sku: string) => setFilters({ sku, page: 1 }), [setFilters])

  const setStatuses = useCallback(
    (statuses: ProductStatus[]) => setFilters({ statuses, page: 1 }),
    [setFilters],
  )

  const setCategoryIds = useCallback(
    (categoryIds: string[]) => setFilters({ categoryIds, page: 1 }),
    [setFilters],
  )

  const setBrandIds = useCallback(
    (brandIds: string[]) => setFilters({ brandIds, page: 1 }),
    [setFilters],
  )

  const setPriceStatus = useCallback(
    (priceStatus: PriceStatus | '') => setFilters({ priceStatus, page: 1 }),
    [setFilters],
  )

  const setCondition = useCallback(
    (condition: ProductCondition | '') => setFilters({ condition, page: 1 }),
    [setFilters],
  )

  const setStockStatus = useCallback(
    (stockStatus: CatalogGridFilters['stockStatus']) =>
      setFilters({ stockStatus, page: 1 }),
    [setFilters],
  )

  const setPriceRange = useCallback(
    (minPrice: string, maxPrice: string) => setFilters({ minPrice, maxPrice, page: 1 }),
    [setFilters],
  )

  const setSort = useCallback(
    (sortBy: CatalogGridSortField): void => {
      const nextDir =
        filters.sortBy === sortBy && filters.sortDir === 'asc' ? 'desc' : 'asc'
      setFilters({ sortBy, sortDir: nextDir, page: 1 })
    },
    [filters.sortBy, filters.sortDir, setFilters],
  )

  const setPage = useCallback((page: number) => setFilters({ page }), [setFilters])

  const clearAllFilters = useCallback((): void => {
    setSearchParams(new URLSearchParams(), { replace: true })
  }, [setSearchParams])

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    const query = {
      search: filters.search.trim() || undefined,
      sku: filters.sku.trim() || undefined,
      statuses: filters.statuses.length > 0 ? filters.statuses : undefined,
      categoryIds: filters.categoryIds.length > 0 ? filters.categoryIds : undefined,
      brandIds: filters.brandIds.length > 0 ? filters.brandIds : undefined,
      priceStatus: filters.priceStatus || undefined,
      condition: filters.condition || undefined,
      minPrice: filters.minPrice.trim() || undefined,
      maxPrice: filters.maxPrice.trim() || undefined,
      stockStatus: filters.stockStatus || undefined,
      sortBy: filters.sortBy || undefined,
      sortDir: filters.sortBy ? filters.sortDir : undefined,
      page: filters.page,
      limit: DEFAULT_LIMIT,
    }
    try {
      const data = await listCatalogGrid(query)
      if (seq === requestSeq.current) {
        setResult(data)
      }
    } catch (caught) {
      if (seq === requestSeq.current) {
        setError(caught)
        setResult(null)
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
    // Refetch tracks the URL params themselves so every navigation refetches.
  }, [searchParams])

  useEffect(() => {
    void refetch()
  }, [refetch])

  /**
   * Reconcile saved rows with the authoritative batch-response values so the
   * grid shows what the server confirmed (including the new concurrency
   * token) without a full refetch.
   */
  const applyRowPatches = useCallback((patches: CatalogGridRowPatch[]) => {
    if (patches.length === 0) {
      return
    }
    const patchMap = new Map(patches.map((patch) => [patch.variantId, patch]))
    setResult((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((item: CatalogGridRow) => {
              const patch = patchMap.get(item.variantId)
              if (!patch) {
                return item
              }
              return {
                ...item,
                price: patch.price,
                compareAtPrice: patch.compareAtPrice,
                stock: patch.stock ?? item.stock,
                expectedUpdatedAt: patch.expectedUpdatedAt,
                sku: patch.sku ?? item.sku,
                barcode: patch.barcode !== undefined ? patch.barcode : item.barcode,
                variantName:
                  patch.variantName !== undefined ? patch.variantName : item.variantName,
                priceStatus: patch.priceStatus ?? item.priceStatus,
              }
            }),
          }
        : prev,
    )
  }, [])

  const rows: CatalogGridRow[] = result?.items ?? []

  return {
    filters,
    rows,
    total: result?.total ?? 0,
    limit: result?.limit ?? DEFAULT_LIMIT,
    loading,
    error,
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
    clearAllFilters,
    refetch,
    applyRowPatches,
  }
}
