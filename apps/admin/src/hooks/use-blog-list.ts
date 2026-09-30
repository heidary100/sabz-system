import { useCallback, useEffect, useRef, useState } from 'react'
import type { AdminBlogPostListResponse, BlogStatus } from '@sabz/types'
import { translateApiError } from '../lib/error-messages'
import { archivePost, listAdminPosts, updatePost } from '../services/blog'

export type BlogStatusFilter = BlogStatus | ''

const DEFAULT_LIMIT = 20

export function useBlogList() {
  const [status, setStatusState] = useState<BlogStatusFilter>('')
  const [page, setPageState] = useState(1)
  const [result, setResult] = useState<AdminBlogPostListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [mutatingId, setMutatingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const requestSeq = useRef(0)

  const setStatus = useCallback((next: BlogStatusFilter) => {
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
      const data = await listAdminPosts({
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

  const mutate = useCallback(
    async (postId: string, action: 'publish' | 'archive'): Promise<void> => {
      setMutatingId(postId)
      setActionError(null)
      try {
        if (action === 'publish') {
          await updatePost(postId, { status: 'PUBLISHED' })
        } else {
          await archivePost(postId)
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

  const publish = useCallback(
    (postId: string): Promise<void> => mutate(postId, 'publish'),
    [mutate],
  )

  const archive = useCallback(
    (postId: string): Promise<void> => mutate(postId, 'archive'),
    [mutate],
  )

  return {
    status,
    page,
    limit: DEFAULT_LIMIT,
    result,
    loading,
    error,
    mutatingId,
    actionError,
    setStatus,
    setPage,
    refetch,
    publish,
    archive,
  }
}
