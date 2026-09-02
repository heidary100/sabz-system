import { useCallback, useEffect, useRef, useState } from 'react'
import type { CategoryTreeNode } from '@sabz/types'
import { fetchCategoryTree } from '../services/categories'

export function useCategoryTree() {
  const [tree, setTree] = useState<CategoryTreeNode[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await fetchCategoryTree()
      if (seq === requestSeq.current) {
        setTree(data)
      }
    } catch (error) {
      if (seq === requestSeq.current) {
        setError(error)
        // keep the previous tree so a transient refetch failure after a
        // successful mutation never blanks the workspace
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

  return { tree, loading, error, refetch }
}