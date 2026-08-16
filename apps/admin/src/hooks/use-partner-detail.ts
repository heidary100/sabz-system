import { useCallback, useEffect, useRef, useState } from 'react'
import type { AdminPartnerDetail } from '@sabz/types'
import { getPartner } from '../services/partners'

export function usePartnerDetail(partnerId: string) {
  const [partner, setPartner] = useState<AdminPartnerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await getPartner(partnerId)
      if (seq === requestSeq.current) {
        setPartner(data)
      }
    } catch (error) {
      if (seq === requestSeq.current) {
        setError(error)
        setPartner(null)
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [partnerId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { partner, loading, error, refetch }
}