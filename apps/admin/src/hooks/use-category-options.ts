import { useCallback, useEffect, useRef, useState } from 'react'
import type { CategorySummary } from '@sabz/types'
import { listCategories } from '../services/categories'

const OPTIONS_LIMIT = 100

export function useCategoryOptions() {
  const [categories, setCategories] = useState<CategorySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await listCategories({ page: 1, limit: OPTIONS_LIMIT })
      if (seq === requestSeq.current) {
        setCategories(data.items)
      }
    } catch (error) {
      if (seq === requestSeq.current) {
        setError(error)
        setCategories([])
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { categories, loading, error, refetch }
}
