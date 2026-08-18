import { useCallback, useEffect, useRef, useState } from 'react'
import type { AdminUserDetail } from '@sabz/types'
import { getUser } from '../services/users'

export function useUserDetail(userId: string) {
  const [user, setUser] = useState<AdminUserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await getUser(userId)
      if (seq === requestSeq.current) {
        setUser(data)
      }
    } catch (error) {
      if (seq === requestSeq.current) {
        setError(error)
        setUser(null)
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [userId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { user, loading, error, refetch }
}
