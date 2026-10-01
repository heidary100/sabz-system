import { useCallback, useEffect, useRef, useState } from 'react'
import type { NotificationListResponse } from '@sabz/types'
import { translateApiError } from '../lib/error-messages'
import {
  listNotifications,
  markNotificationRead,
  unreadNotificationCount,
} from '../services/notifications'

const DEFAULT_LIMIT = 20

export function useNotificationList() {
  const [unreadOnly, setUnreadOnlyState] = useState(true)
  const [page, setPageState] = useState(1)
  const [result, setResult] = useState<NotificationListResponse | null>(null)
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [mutatingId, setMutatingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const requestSeq = useRef(0)

  const setUnreadOnly = useCallback((next: boolean) => {
    setUnreadOnlyState((prev) => {
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
      const [data, count] = await Promise.all([
        listNotifications({
          unreadOnly: unreadOnly || undefined,
          page,
          limit: DEFAULT_LIMIT,
        }),
        unreadNotificationCount(),
      ])
      if (seq === requestSeq.current) {
        setResult(data)
        setUnread(count.unread)
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
  }, [unreadOnly, page])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const totalPages = result
    ? Math.max(1, Math.ceil(result.total / DEFAULT_LIMIT))
    : 1
  useEffect(() => {
    if (page > totalPages) {
      setPageState(totalPages)
    }
  }, [page, totalPages])

  const markRead = useCallback(async (notificationId: string) => {
    setMutatingId(notificationId)
    setActionError(null)
    try {
      await markNotificationRead(notificationId)
      await refetch()
    } catch (error) {
      setActionError(translateApiError(error))
    } finally {
      setMutatingId(null)
    }
  }, [refetch])

  return {
    unreadOnly,
    page,
    limit: DEFAULT_LIMIT,
    result,
    unread,
    loading,
    error,
    mutatingId,
    actionError,
    setUnreadOnly,
    setPage,
    refetch,
    markRead,
  }
}
