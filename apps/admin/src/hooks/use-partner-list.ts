import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AdminPartnerListItem,
  PaginatedResult,
  PartnerListQuery,
  PartnerStatus,
} from '@sabz/types'
import { listPartners } from '../services/partners'

export interface PartnerListState {
  status: PartnerStatus
  page: number
  limit: number
}

const DEFAULT_LIMIT = 20

export function usePartnerList() {
  const [state, setState] = useState<PartnerListState>({
    status: 'PENDING',
    page: 1,
    limit: DEFAULT_LIMIT,
  })
  const [result, setResult] = useState<PaginatedResult<AdminPartnerListItem> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const setStatus = useCallback((status: PartnerStatus) => {
    setState((prev) => (prev.status === status ? prev : { ...prev, status, page: 1 }))
  }, [])

  const setPage = useCallback((page: number) => {
    setState((prev) => (prev.page === page ? prev : { ...prev, page }))
  }, [])

  const setLimit = useCallback((limit: number) => {
    setState((prev) =>
      prev.limit === limit ? prev : { ...prev, limit, page: 1 },
    )
  }, [])

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    const query: PartnerListQuery = {
      status: state.status,
      page: state.page,
      limit: state.limit,
    }
    try {
      const data = await listPartners(query)
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
  }, [state])

  useEffect(() => {
    void refetch()
  }, [refetch])

  useEffect(() => {
    if (result && state.page > Math.max(1, Math.ceil(result.total / state.limit))) {
      setPage(Math.max(1, Math.ceil(result.total / state.limit)))
    }
  }, [result, state.page, setPage])

  return {
    status: state.status,
    page: state.page,
    limit: state.limit,
    result,
    loading,
    error,
    setStatus,
    setPage,
    setLimit,
    refetch,
  }
}