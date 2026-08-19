import { useCallback, useEffect, useRef, useState } from 'react'
import type { DashboardSummary } from '@sabz/types'
import { getDashboard } from '../services/dashboard'

export function useDashboard() {
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await getDashboard()
      if (seq === requestSeq.current) {
        setDashboard(data)
        setError(null)
      }
    } catch (error) {
      if (seq === requestSeq.current) {
        setError(error)
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { dashboard, loading, error, refetch }
}