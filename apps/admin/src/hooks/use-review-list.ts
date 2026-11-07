import { useCallback, useEffect, useRef, useState } from 'react'
import type { AdminReviewListResponse, ReviewStatus } from '@sabz/types'
import { translateApiError } from '../lib/error-messages'
import { approveReview, listReviews, rejectReview } from '../services/reviews'

export type ReviewStatusFilter = ReviewStatus | ''

const DEFAULT_LIMIT = 20

export function useReviewList() {
  const [status, setStatusState] = useState<ReviewStatusFilter>('PENDING')
  const [page, setPageState] = useState(1)
  const [limit, setLimitState] = useState(DEFAULT_LIMIT)
  const [result, setResult] = useState<AdminReviewListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [mutatingId, setMutatingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const requestSeq = useRef(0)

  const setStatus = useCallback((next: ReviewStatusFilter) => {
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
      const data = await listReviews({
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

  const moderate = useCallback(
    async (reviewId: string, action: 'approve' | 'reject'): Promise<void> => {
      setMutatingId(reviewId)
      setActionError(null)
      try {
        if (action === 'approve') {
          await approveReview(reviewId)
        } else {
          await rejectReview(reviewId)
        }
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
    (reviewId: string): Promise<void> => moderate(reviewId, 'approve'),
    [moderate],
  )

  const reject = useCallback(
    (reviewId: string): Promise<void> => moderate(reviewId, 'reject'),
    [moderate],
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
    reject,
  }
}
