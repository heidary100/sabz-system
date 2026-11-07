import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrandSummary, PaginatedResult } from '@sabz/types'
import { listBrands } from '../services/brands'

const DEFAULT_LIMIT = 20

export function useBrandList() {
  const [page, setPage] = useState(1)
  const [limit, setLimitState] = useState(DEFAULT_LIMIT)
  const [result, setResult] = useState<PaginatedResult<BrandSummary> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await listBrands({ page, limit })
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
  }, [page, limit])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const setLimit = useCallback((next: number) => {
    setLimitState((prev) => {
      if (prev === next) {
        return prev
      }
      setPage(1)
      return next
    })
  }, [])

  useEffect(() => {
    if (result && page > Math.max(1, Math.ceil(result.total / limit))) {
      setPage(Math.max(1, Math.ceil(result.total / limit)))
    }
  }, [result, page, limit])

  return { page, limit, result, loading, error, setPage, setLimit, refetch }
}
