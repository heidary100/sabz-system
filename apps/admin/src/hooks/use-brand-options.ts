import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrandSummary } from '@sabz/types'
import { listBrands } from '../services/brands'

const OPTIONS_LIMIT = 100

export function useBrandOptions() {
  const [brands, setBrands] = useState<BrandSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await listBrands({ page: 1, limit: OPTIONS_LIMIT })
      if (seq === requestSeq.current) {
        setBrands(data.items)
      }
    } catch (error) {
      if (seq === requestSeq.current) {
        setError(error)
        setBrands([])
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

  return { brands, loading, error, refetch }
}
