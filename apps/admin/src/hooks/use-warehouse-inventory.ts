import { useCallback, useEffect, useRef, useState } from 'react'
import type { InventoryItemSummary, PaginatedResult } from '@sabz/types'
import { listWarehouseInventory } from '../services/inventory'

const DEFAULT_LIMIT = 20

export function useWarehouseInventory(warehouseId: string) {
  const [page, setPage] = useState(1)
  const [limit, setLimitState] = useState(DEFAULT_LIMIT)
  const [result, setResult] = useState<PaginatedResult<InventoryItemSummary> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await listWarehouseInventory(warehouseId, {
        page,
        limit,
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
  }, [warehouseId, page, limit])

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
    setPage(1)
  }, [warehouseId])

  useEffect(() => {
    if (result && page > Math.max(1, Math.ceil(result.total / limit))) {
      setPage(Math.max(1, Math.ceil(result.total / limit)))
    }
  }, [result, page, limit])

  return {
    page,
    limit,
    result,
    loading,
    error,
    setPage,
    setLimit,
    refetch,
  }
}