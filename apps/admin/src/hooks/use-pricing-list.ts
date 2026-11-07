import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CategoryPriceRuleListResponse,
  ProductPriceOverrideListResponse,
  PromotionListResponse,
} from '@sabz/types'
import type { PricingActiveFilter } from '../lib/pricing-labels'
import {
  listCategoryRules,
  listProductOverrides,
  listPromotions,
  type PricingListQuery,
} from '../services/pricing'

const DEFAULT_LIMIT = 20

interface PricingListShape {
  items: unknown[]
  total: number
  limit: number
}

function usePricingResource<T extends PricingListShape>(
  lister: (query: PricingListQuery) => Promise<T>,
) {
  const [active, setActiveState] = useState<PricingActiveFilter>('')
  const [page, setPageState] = useState(1)
  const [limit, setLimitState] = useState(DEFAULT_LIMIT)
  const [result, setResult] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const setActive = useCallback((next: PricingActiveFilter) => {
    setActiveState((prev) => {
      if (prev === next) {
        return prev
      }
      setPageState(1)
      return next
    })
  }, [])

  const setPage = useCallback((next: number) => {
    setPageState((prev) => (prev === next ? prev : next))
  }, [])

  const setLimit = useCallback((next: number) => {
    setLimitState((prev) => {
      if (prev === next) {
        return prev
      }
      setPageState(1)
      return next
    })
  }, [])

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await lister({
        isActive: active === '' ? undefined : active === 'active',
        page,
        limit,
      })
      if (seq === requestSeq.current) {
        setResult(data)
      }
    } catch (error) {
      if (seq === requestSeq.current) {
        setError(error)
        setResult(null)
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [active, page, limit, lister])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const totalPages = result ? Math.max(1, Math.ceil(result.total / limit)) : 1
  useEffect(() => {
    if (page > totalPages) {
      setPageState(totalPages)
    }
  }, [page, totalPages])

  return {
    active,
    page,
    limit,
    result,
    loading,
    error,
    setActive,
    setPage,
    setLimit,
    refetch,
  }
}

export function useCategoryRuleList() {
  return usePricingResource<CategoryPriceRuleListResponse>(listCategoryRules)
}

export function useProductOverrideList() {
  return usePricingResource<ProductPriceOverrideListResponse>(listProductOverrides)
}

export function usePromotionList() {
  return usePricingResource<PromotionListResponse>(listPromotions)
}
