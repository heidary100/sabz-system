import { useCallback, useEffect, useRef, useState } from 'react'
import type { MerchCampaignDto } from '@sabz/types'
import { getMerchCampaign } from '../services/merchandising'

export function useMerchCampaignDetail(id: string | undefined) {
  const [campaign, setCampaign] = useState<MerchCampaignDto | null>(null)
  const [loading, setLoading] = useState(Boolean(id))
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const refetch = useCallback(async (): Promise<MerchCampaignDto | null> => {
    if (!id) {
      setCampaign(null)
      setLoading(false)
      setError(null)
      return null
    }
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await getMerchCampaign(id)
      if (seq === requestSeq.current) {
        setCampaign(data)
      }
      return data
    } catch (error) {
      if (seq === requestSeq.current) {
        setError(error)
      }
      return null
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [id])

  useEffect(() => {
    setCampaign(null)
    void refetch()
  }, [refetch])

  return {
    campaign,
    loading,
    error,
    refetch,
    replaceCampaign: setCampaign,
  }
}
