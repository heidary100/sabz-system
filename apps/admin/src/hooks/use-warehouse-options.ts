import { useCallback, useEffect, useRef, useState } from 'react'
import type { WarehouseSummary } from '@sabz/types'
import { listWarehouseOptions } from '../services/inventory'

export function useWarehouseOptions() {
  const [warehouses, setWarehouses] = useState<WarehouseSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await listWarehouseOptions()
      if (seq === requestSeq.current) {
        setWarehouses(data)
      }
    } catch (error) {
      if (seq === requestSeq.current) {
        setError(error)
        setWarehouses([])
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

  return { warehouses, loading, error, refetch }
}