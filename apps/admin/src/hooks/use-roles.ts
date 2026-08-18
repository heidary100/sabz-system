import { useCallback, useEffect, useState } from 'react'
import type { RoleSummary } from '@sabz/types'
import { listRoles } from '../services/roles'

export function useRoles(enabled = true) {
  const [roles, setRoles] = useState<RoleSummary[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<unknown>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRoles(await listRoles())
    } catch (error) {
      setError(error)
      setRoles([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      return
    }
    void refetch()
  }, [enabled, refetch])

  return { roles, loading, error, refetch }
}
