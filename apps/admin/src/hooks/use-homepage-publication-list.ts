import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  HomepagePublicationListResponse,
  HomepagePublicationStatus,
} from '@sabz/types'
import { listHomepagePublications } from '../services/merchandising'

export type HomepagePublicationStatusFilter = HomepagePublicationStatus | ''

export const HOMEPAGE_PUBLICATION_PAGE_SIZE = 20

export function useHomepagePublicationList() {
  const [status, setStatusState] = useState<HomepagePublicationStatusFilter>('')
  const [page, setPageState] = useState(1)
  const [limit, setLimitState] = useState(HOMEPAGE_PUBLICATION_PAGE_SIZE)
  const [result, setResult] =
    useState<HomepagePublicationListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const setStatus = useCallback((next: HomepagePublicationStatusFilter) => {
    setStatusState(next)
    setPageState(1)
  }, [])

  const setPage = useCallback((next: number) => {
    setPageState(next)
  }, [])

  const setLimit = useCallback((next: number) => {
    setLimitState(next)
    setPageState(1)
  }, [])

  const refetch = useCallback(async (): Promise<void> => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const response = await listHomepagePublications({
        page,
        limit,
        status: status === '' ? undefined : status,
      })
      if (seq === requestSeq.current) {
        const availablePages = Math.max(
          1,
          Math.ceil(response.total / limit),
        )
        if (page > availablePages) {
          setPageState(availablePages)
          return
        }
        setResult(response)
      }
    } catch (loadError) {
      if (seq === requestSeq.current) {
        setError(loadError)
        setResult(null)
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [page, limit, status])

  useEffect(() => {
    void refetch()
  }, [refetch])

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
