import { useCallback, useEffect, useRef, useState } from 'react'
import type { RfqListResponse, RfqStatus } from '@sabz/types'
import { listRfqs } from '../services/rfq'

export type RfqStatusFilter = RfqStatus | ''

const DEFAULT_LIMIT = 20

export function useRfqList() {
  const [status, setStatusState] = useState<RfqStatusFilter>('')
  const [page, setPageState] = useState(1)
  const [limit, setLimitState] = useState(DEFAULT_LIMIT)
  const [result, setResult] = useState<RfqListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const setStatus = useCallback((next: RfqStatusFilter) => {
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

  const setLimit = useCallback((next: number) => {
    setLimitState((prev) => {
      if (prev === next) {
        return prev
      }
      setPageState(1)
      return next
    })
  }, [])

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await listRfqs({
        status: status || undefined,
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
  }, [status, page, limit])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const totalPages = result ? Math.max(1, Math.ceil(result.total / limit)) : 1
  useEffect(() => {
    if (page > totalPages) {
      setPageState(totalPages)
    }
  }, [page, totalPages])

  return {
    status,
    page,
    limit,
    result,
    loading,
    error,
    setStatus,
    setPage,
    setLimit,
    refetch,
  }
}
