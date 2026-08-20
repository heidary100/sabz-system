import { useCallback, useEffect, useRef, useState } from 'react'
import type { PaginatedResult, ProductListQuery, ProductStatus, ProductSummary } from '@sabz/types'
import { listProducts } from '../services/products'

export interface ProductListFilters {
  search: string
  status: ProductStatus | ''
  categoryId: string
  brandId: string
  page: number
}

const DEFAULT_LIMIT = 20

export function useProductList() {
  const [filters, setFilters] = useState<ProductListFilters>({
    search: '',
    status: '',
    categoryId: '',
    brandId: '',
    page: 1,
  })
  const [result, setResult] = useState<PaginatedResult<ProductSummary> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const setSearch = useCallback((search: string) => {
    setFilters((prev) => (prev.search === search ? prev : { ...prev, search, page: 1 }))
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
    const query: ProductListQuery = {
      search: filters.search.trim() || undefined,
      status: filters.status || undefined,
      categoryId: filters.categoryId || undefined,
      brandId: filters.brandId || undefined,
      page: filters.page,
      limit: DEFAULT_LIMIT,
    }
    try {
      const data = await listProducts(query)
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
    status: filters.status,
    categoryId: filters.categoryId,
    brandId: filters.brandId,
    page: filters.page,
    limit: DEFAULT_LIMIT,
    result,
    loading,
    error,
    setSearch,
    setStatus,
    setCategoryId,
    setBrandId,
    setPage,
    refetch,
  }
}
