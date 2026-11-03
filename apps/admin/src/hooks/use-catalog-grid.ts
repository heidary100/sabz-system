import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CatalogGridListResponse,
  CatalogGridRow,
  ProductStatus,
} from '@sabz/types'
import { listCatalogGrid } from '../services/catalog-grid'

export interface CatalogGridFilters {
  search: string
  sku: string
  status: ProductStatus | ''
  categoryId: string
  brandId: string
  page: number
}

/** Server-side patch of a saved row (authoritative values from the batch response). */
export interface CatalogGridRowPatch {
  variantId: string
  price: string
  compareAtPrice: string | null
  expectedUpdatedAt: string
  stock?: number
}

const DEFAULT_LIMIT = 50

/** Server-paginated catalog grid rows + filter state (SS-257). */
export function useCatalogGrid() {
  const [filters, setFilters] = useState<CatalogGridFilters>({
    search: '',
    sku: '',
    status: '',
    categoryId: '',
    brandId: '',
    page: 1,
  })
  const [result, setResult] = useState<CatalogGridListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const setSearch = useCallback((search: string) => {
    setFilters((prev) => (prev.search === search ? prev : { ...prev, search, page: 1 }))
  }, [])

  const setSku = useCallback((sku: string) => {
    setFilters((prev) => (prev.sku === sku ? prev : { ...prev, sku, page: 1 }))
  }, [])

  const setStatus = useCallback((status: ProductStatus | '') => {
    setFilters((prev) => (prev.status === status ? prev : { ...prev, status, page: 1 }))
  }, [])

  const setCategoryId = useCallback((categoryId: string) => {
    setFilters((prev) => (prev.categoryId === categoryId ? prev : { ...prev, categoryId, page: 1 }))
  }, [])

  const setBrandId = useCallback((brandId: string) => {
    setFilters((prev) => (prev.brandId === brandId ? prev : { ...prev, brandId, page: 1 }))
  }, [])

  const setPage = useCallback((page: number) => {
    setFilters((prev) => (prev.page === page ? prev : { ...prev, page }))
  }, [])

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    const query = {
      search: filters.search.trim() || undefined,
      sku: filters.sku.trim() || undefined,
      status: filters.status || undefined,
      categoryId: filters.categoryId || undefined,
      brandId: filters.brandId || undefined,
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
  }, [filters])

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
    setStatus,
    setCategoryId,
    setBrandId,
    setPage,
    refetch,
    applyRowPatches,
  }
}
