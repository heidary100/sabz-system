import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProductDetail } from '@sabz/types'
import { getProduct } from '../services/products'

export function useProductDetail(productId: string) {
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await getProduct(productId)
      if (seq === requestSeq.current) {
        setProduct(data)
      }
    } catch (error) {
      if (seq === requestSeq.current) {
        setError(error)
        setProduct(null)
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [productId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { product, loading, error, refetch }
}
