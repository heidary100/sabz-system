import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuditEntry } from '@sabz/types'
import { listAudit } from '../services/audit'

const PAGE_SIZE = 10

export function useHomepagePublicationAudit(
  publicationId: string | undefined,
  enabled = true,
) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const refetch = useCallback(async (): Promise<void> => {
    if (!publicationId || !enabled) {
      return
    }
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const result = await listAudit({
        entity: 'HomepagePublication',
        entityId: publicationId,
        page: 1,
        limit: PAGE_SIZE,
      })
      if (seq === requestSeq.current) {
        setEntries(result.items)
        setTotal(result.total)
      }
    } catch (loadError) {
      if (seq === requestSeq.current) {
        setError(loadError)
        setEntries([])
        setTotal(0)
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [publicationId, enabled])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { entries, total, limit: PAGE_SIZE, loading, error, refetch }
}
