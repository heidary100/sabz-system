import { useCallback, useEffect, useRef, useState } from 'react'
import type { AdminOrderListResponse, OrderStatus } from '@sabz/types'
import { listOrders } from '../services/orders'

export type OrderStatusFilter = OrderStatus | ''

const DEFAULT_LIMIT = 20

export function useOrderList() {
  const [status, setStatusState] = useState<OrderStatusFilter>('')
  const [page, setPageState] = useState(1)
  const [result, setResult] = useState<AdminOrderListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const setStatus = useCallback((next: OrderStatusFilter) => {
    setStatusState((prev) => {
      if (prev === next) {
        return prev
      }
      setPageState(1)
      return next
    })
  }, [])

  const setPage = useCallback((next: number) => {
    setPageState((prev) => (prev === next ? prev : next))
  }, [])

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await listOrders({
        status: status || undefined,
        page,
        limit: DEFAULT_LIMIT,
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
  }, [status, page])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const totalPages = result ? Math.max(1, Math.ceil(result.total / DEFAULT_LIMIT)) : 1
  useEffect(() => {
    if (page > totalPages) {
      setPageState(totalPages)
    }
  }, [page, totalPages])

  return {
    status,
    page,
    limit: DEFAULT_LIMIT,
    result,
    loading,
    error,
    setStatus,
    setPage,
    refetch,
  }
}
