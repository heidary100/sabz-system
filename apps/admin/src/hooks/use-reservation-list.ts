import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  PaginatedResult,
  ReservationListQuery,
  ReservationStatus,
  ReservationSummary,
} from '@sabz/types'
import { listReservations } from '../services/inventory'

export interface ReservationListFilters {
  status: ReservationStatus | ''
  warehouseId: string
  variantId: string
  page: number
}

const DEFAULT_LIMIT = 20
const EMPTY_FILTERS: Omit<ReservationListFilters, 'page'> = {
  status: '',
  warehouseId: '',
  variantId: '',
}

export function useReservationList(initialVariantId = '') {
  const [filters, setFilters] = useState<ReservationListFilters>({
    ...EMPTY_FILTERS,
    variantId: initialVariantId,
    page: 1,
  })
  const [result, setResult] = useState<PaginatedResult<ReservationSummary> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const setStatus = useCallback((status: ReservationStatus | '') => {
    setFilters((prev) => (prev.status === status ? prev : { ...prev, status, page: 1 }))
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

  const setPage = useCallback((page: number) => {
    setFilters((prev) => (prev.page === page ? prev : { ...prev, page }))
  }, [])

  const clearFilters = useCallback(() => {
    setFilters((prev) =>
      prev.status === '' &&
      prev.warehouseId === '' &&
      prev.variantId === '' &&
      prev.page === 1
        ? prev
        : { ...EMPTY_FILTERS, page: 1 },
    )
  }, [])

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    const query: ReservationListQuery = {
      status: filters.status || undefined,
      warehouseId: filters.warehouseId || undefined,
      variantId: filters.variantId.trim() || undefined,
      page: filters.page,
      limit: DEFAULT_LIMIT,
    }
    try {
      const data = await listReservations(query)
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
    status: filters.status,
    warehouseId: filters.warehouseId,
    variantId: filters.variantId,
    page: filters.page,
    limit: DEFAULT_LIMIT,
    result,
    loading,
    error,
    setStatus,
    setWarehouseId,
    setVariantId,
    setPage,
    clearFilters,
    refetch,
  }
}