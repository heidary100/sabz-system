import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuditEntry } from '@sabz/types'
import { listAudit } from '../services/audit'

const PAGE_SIZE = 20

export function useMerchCampaignAudit(
  campaignId: string | undefined,
  enabled: boolean,
) {
  const [page, setPage] = useState(1)
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const refetch = useCallback(async () => {
    if (!campaignId || !enabled) {
      return
    }
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const result = await listAudit({
        entity: 'MerchCampaign',
        entityId: campaignId,
        page,
        limit: PAGE_SIZE,
      })
      if (seq === requestSeq.current) {
        setEntries(result.items)
        setTotal(result.total)
      }
    } catch (error) {
      if (seq === requestSeq.current) {
        setError(error)
        setEntries([])
        setTotal(0)
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [campaignId, enabled, page])

  useEffect(() => {
    void refetch()
  }, [refetch])

  useEffect(() => {
    setPage(1)
  }, [campaignId])

  return {
    page,
    limit: PAGE_SIZE,
    entries,
    total,
    loading,
    error,
    setPage,
    refetch,
  }
}
