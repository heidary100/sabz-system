import { useCallback, useEffect, useRef, useState } from 'react'
import type { AdminReturnListResponse, ReturnStatus } from '@sabz/types'
import { translateApiError } from '../lib/error-messages'
import {
  approveReturn,
  completeReturn,
  listReturns,
  receiveReturn,
  rejectReturn,
} from '../services/returns'

export type ReturnStatusFilter = ReturnStatus | ''

const DEFAULT_LIMIT = 20

export function useReturnList() {
  const [status, setStatusState] = useState<ReturnStatusFilter>('PENDING')
  const [page, setPageState] = useState(1)
  const [limit, setLimitState] = useState(DEFAULT_LIMIT)
  const [result, setResult] = useState<AdminReturnListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [mutatingId, setMutatingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const requestSeq = useRef(0)

  const setStatus = useCallback((next: ReturnStatusFilter) => {
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
      const data = await listReturns({
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

  const runTransition = useCallback(
    async (returnId: string, transition: (id: string) => Promise<unknown>) => {
      setMutatingId(returnId)
      setActionError(null)
      try {
        await transition(returnId)
        await refetch()
      } catch (error) {
        setActionError(translateApiError(error))
      } finally {
        setMutatingId(null)
      }
    },
    [refetch],
  )

  const approve = useCallback(
    (returnId: string): Promise<void> =>
      runTransition(returnId, (id) => approveReturn(id)),
    [runTransition],
  )

  const receive = useCallback(
    (returnId: string): Promise<void> =>
      runTransition(returnId, (id) => receiveReturn(id)),
    [runTransition],
  )

  const complete = useCallback(
    (returnId: string): Promise<void> =>
      runTransition(returnId, (id) => completeReturn(id)),
    [runTransition],
  )

  const reject = useCallback(
    (returnId: string, reason: string): Promise<void> =>
      runTransition(returnId, (id) => rejectReturn(id, reason)),
    [runTransition],
  )

  return {
    status,
    page,
    limit,
    result,
    loading,
    error,
    mutatingId,
    actionError,
    setStatus,
    setPage,
    setLimit,
    refetch,
    approve,
    receive,
    complete,
    reject,
  }
}
