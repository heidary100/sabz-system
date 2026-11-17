import { useCallback, useEffect, useRef, useState } from 'react'
import type { MerchMediaListResponse } from '@sabz/types'
import { listMerchMedia } from '../services/merchandising'

export type MerchMediaPublishedFilter = '' | 'true' | 'false'

interface MediaListFilters {
  search: string
  isPublished: MerchMediaPublishedFilter
  page: number
  limit: number
}

const DEFAULT_LIMIT = 20

export function useMerchMediaList() {
  const [filters, setFilters] = useState<MediaListFilters>({
    search: '',
    isPublished: '',
    page: 1,
    limit: DEFAULT_LIMIT,
  })
  const [result, setResult] = useState<MerchMediaListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const setSearch = useCallback((search: string) => {
    setFilters((prev) =>
      prev.search === search ? prev : { ...prev, search, page: 1 },
    )
  }, [])

  const setPublished = useCallback((isPublished: MerchMediaPublishedFilter) => {
    setFilters((prev) =>
      prev.isPublished === isPublished
        ? prev
        : { ...prev, isPublished, page: 1 },
    )
  }, [])

  const setPage = useCallback((page: number) => {
    setFilters((prev) => (prev.page === page ? prev : { ...prev, page }))
  }, [])

  const setLimit = useCallback((limit: number) => {
    setFilters((prev) =>
      prev.limit === limit ? prev : { ...prev, limit, page: 1 },
    )
  }, [])

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await listMerchMedia({
        page: filters.page,
        limit: filters.limit,
        q: filters.search.trim() || undefined,
        isPublished:
          filters.isPublished === ''
            ? undefined
            : filters.isPublished === 'true',
      })
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
    if (result) {
      const totalPages = Math.max(1, Math.ceil(result.total / filters.limit))
      if (filters.page > totalPages) {
        setPage(totalPages)
      }
    }
  }, [result, filters.page, filters.limit, setPage])

  return {
    search: filters.search,
    isPublished: filters.isPublished,
    page: filters.page,
    limit: filters.limit,
    result,
    loading,
    error,
    setSearch,
    setPublished,
    setPage,
    setLimit,
    refetch,
  }
}
