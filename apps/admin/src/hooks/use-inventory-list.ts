import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  InventoryItemSummary,
  InventoryListQuery,
  InventoryStockStatus,
  PaginatedResult,
} from '@sabz/types'
import { listInventory } from '../services/inventory'

export interface InventoryListFilters {
  search: string
  warehouseId: string
  stockStatus: InventoryStockStatus | ''
  page: number
}

const DEFAULT_LIMIT = 20

export function useInventoryList() {
  const [filters, setFilters] = useState<InventoryListFilters>({
    search: '',
    warehouseId: '',
    stockStatus: '',
    page: 1,
  })
  const [result, setResult] = useState<PaginatedResult<InventoryItemSummary> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const setSearch = useCallback((search: string) => {
    setFilters((prev) => (prev.search === search ? prev : { ...prev, search, page: 1 }))
  }, [])

  const setWarehouseId = useCallback((warehouseId: string) => {
    setFilters((prev) =>
      prev.warehouseId === warehouseId ? prev : { ...prev, warehouseId, page: 1 },
    )
  }, [])

  const setStockStatus = useCallback((stockStatus: InventoryStockStatus | '') => {
    setFilters((prev) =>
      prev.stockStatus === stockStatus ? prev : { ...prev, stockStatus, page: 1 },
    )
  }, [])

  const setPage = useCallback((page: number) => {
    setFilters((prev) => (prev.page === page ? prev : { ...prev, page }))
  }, [])

  const clearFilters = useCallback(() => {
    setFilters((prev) =>
      prev.search === '' &&
      prev.warehouseId === '' &&
      prev.stockStatus === '' &&
      prev.page === 1
        ? prev
        : { search: '', warehouseId: '', stockStatus: '', page: 1 },
    )
  }, [])

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    const query: InventoryListQuery = {
      search: filters.search.trim() || undefined,
      warehouseId: filters.warehouseId || undefined,
      stockStatus: filters.stockStatus || undefined,
      page: filters.page,
      limit: DEFAULT_LIMIT,
    }
    try {
      const data = await listInventory(query)
      if (seq === requestSeq.current) {
        setResult(data)
      }
    } catch (error) {
      if (seq === requestSeq.current) {
        setError(error)
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

  useEffect(() => {
    if (result && filters.page > Math.max(1, Math.ceil(result.total / result.limit))) {
      setPage(Math.max(1, Math.ceil(result.total / result.limit)))
    }
  }, [result, filters.page, setPage])

  return {
    search: filters.search,
    warehouseId: filters.warehouseId,
    stockStatus: filters.stockStatus,
    page: filters.page,
    limit: DEFAULT_LIMIT,
    result,
    loading,
    error,
    setSearch,
    setWarehouseId,
    setStockStatus,
    setPage,
    clearFilters,
    refetch,
  }
}