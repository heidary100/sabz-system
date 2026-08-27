import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  InventoryMovementSummary,
  InventoryMovementType,
  MovementListQuery,
  PaginatedResult,
} from '@sabz/types'
import { listInventoryMovements } from '../services/inventory'

export interface InventoryMovementFilters {
  type: InventoryMovementType | ''
  warehouseId: string
  variantId: string
  from: string
  to: string
  page: number
}

const DEFAULT_LIMIT = 20
const EMPTY_FILTERS: Omit<InventoryMovementFilters, 'page'> = {
  type: '',
  warehouseId: '',
  variantId: '',
  from: '',
  to: '',
}

export function useInventoryMovements(initialVariantId = '') {
  const [filters, setFilters] = useState<InventoryMovementFilters>({
    ...EMPTY_FILTERS,
    variantId: initialVariantId,
    page: 1,
  })
  const [result, setResult] = useState<PaginatedResult<InventoryMovementSummary> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const setType = useCallback((type: InventoryMovementType | '') => {
    setFilters((prev) => (prev.type === type ? prev : { ...prev, type, page: 1 }))
  }, [])

  const setWarehouseId = useCallback((warehouseId: string) => {
    setFilters((prev) =>
      prev.warehouseId === warehouseId ? prev : { ...prev, warehouseId, page: 1 },
    )
  }, [])

  const setVariantId = useCallback((variantId: string) => {
    setFilters((prev) =>
      prev.variantId === variantId ? prev : { ...prev, variantId, page: 1 },
    )
  }, [])

  const setFrom = useCallback((from: string) => {
    setFilters((prev) => (prev.from === from ? prev : { ...prev, from, page: 1 }))
  }, [])

  const setTo = useCallback((to: string) => {
    setFilters((prev) => (prev.to === to ? prev : { ...prev, to, page: 1 }))
  }, [])

  const setPage = useCallback((page: number) => {
    setFilters((prev) => (prev.page === page ? prev : { ...prev, page }))
  }, [])

  const clearFilters = useCallback(() => {
    setFilters((prev) =>
      prev.type === '' &&
      prev.warehouseId === '' &&
      prev.variantId === '' &&
      prev.from === '' &&
      prev.to === '' &&
      prev.page === 1
        ? prev
        : { ...EMPTY_FILTERS, page: 1 },
    )
  }, [])

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    const query: MovementListQuery = {
      type: filters.type || undefined,
      warehouseId: filters.warehouseId || undefined,
      variantId: filters.variantId.trim() || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      page: filters.page,
      limit: DEFAULT_LIMIT,
    }
    try {
      const data = await listInventoryMovements(query)
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
    type: filters.type,
    warehouseId: filters.warehouseId,
    variantId: filters.variantId,
    from: filters.from,
    to: filters.to,
    page: filters.page,
    limit: DEFAULT_LIMIT,
    result,
    loading,
    error,
    setType,
    setWarehouseId,
    setVariantId,
    setFrom,
    setTo,
    setPage,
    clearFilters,
    refetch,
  }
}