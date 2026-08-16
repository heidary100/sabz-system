import { useCallback, useEffect, useState } from 'react'
import type { PartnerTierSummary } from '@sabz/types'
import { listTiers } from '../services/partners'

export function useTiers() {
  const [tiers, setTiers] = useState<PartnerTierSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setTiers(await listTiers())
    } catch (error) {
      setError(error)
      setTiers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { tiers, loading, error, refetch }
}