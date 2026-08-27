import { useCallback, useEffect, useRef, useState } from 'react'
import type { InventoryItemSummary } from '@sabz/types'
import { listVariantInventory } from '../services/inventory'

export function useVariantInventory(variantId: string) {
  const [rows, setRows] = useState<InventoryItemSummary[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await listVariantInventory(variantId)
      if (seq === requestSeq.current) {
        setRows(data)
      }
    } catch (error) {
      if (seq === requestSeq.current) {
        setError(error)
        setRows(null)
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [variantId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { rows, loading, error, refetch }
}