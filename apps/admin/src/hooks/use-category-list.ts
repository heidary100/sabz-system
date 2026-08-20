import { useCallback, useEffect, useRef, useState } from 'react'
import type { CategorySummary, PaginatedResult } from '@sabz/types'
import { listCategories } from '../services/categories'

const DEFAULT_LIMIT = 20

export function useCategoryList() {
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<PaginatedResult<CategorySummary> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await listCategories({ page, limit: DEFAULT_LIMIT })
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
  }, [page])

  useEffect(() => {
    void refetch()
  }, [refetch])

  useEffect(() => {
    if (result && page > Math.max(1, Math.ceil(result.total / result.limit))) {
      setPage(Math.max(1, Math.ceil(result.total / result.limit)))
    }
  }, [result, page])

  return { page, limit: DEFAULT_LIMIT, result, loading, error, setPage, refetch }
}
