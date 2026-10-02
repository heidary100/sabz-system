import { useCallback, useEffect, useRef, useState } from 'react'
import type { PartnerTierSummary } from '@sabz/types'
import { listPartnerTiers } from '../services/partner-tiers'

/**
 * Partner-tier list hook (SS-042 follow-up, #90). Tiers are a small
 * reference set — no pagination or filters, just an honest list with
 * stale-response guarding, mirroring the pricing-list D-pattern.
 */
export function usePartnerTierList() {
  const [tiers, setTiers] = useState<PartnerTierSummary[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await listPartnerTiers()
      if (seq === requestSeq.current) {
        setTiers(data)
      }
    } catch (fetchError) {
      if (seq === requestSeq.current) {
        setError(fetchError)
        setTiers(null)
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

  return { tiers, loading, error, refetch }
}
