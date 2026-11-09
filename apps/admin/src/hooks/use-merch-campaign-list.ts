import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  MerchCampaignListResponse,
  MerchCampaignType,
} from '@sabz/types'
import { listMerchCampaigns } from '../services/merchandising'

export type CampaignBooleanFilter = '' | 'true' | 'false'

interface CampaignListFilters {
  search: string
  type: MerchCampaignType | ''
  isEnabled: CampaignBooleanFilter
  isArchived: CampaignBooleanFilter
  page: number
  limit: number
}

const DEFAULT_LIMIT = 20

export function useMerchCampaignList() {
  const [filters, setFilters] = useState<CampaignListFilters>({
    search: '',
    type: '',
    isEnabled: '',
    isArchived: 'false',
    page: 1,
    limit: DEFAULT_LIMIT,
  })
  const [result, setResult] = useState<MerchCampaignListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const setSearch = useCallback((search: string) => {
    setFilters((prev) =>
      prev.search === search ? prev : { ...prev, search, page: 1 },
    )
  }, [])

  const setType = useCallback((type: MerchCampaignType | '') => {
    setFilters((prev) =>
      prev.type === type ? prev : { ...prev, type, page: 1 },
    )
  }, [])

  const setEnabled = useCallback((isEnabled: CampaignBooleanFilter) => {
    setFilters((prev) =>
      prev.isEnabled === isEnabled
        ? prev
        : { ...prev, isEnabled, page: 1 },
    )
  }, [])

  const setArchived = useCallback((isArchived: CampaignBooleanFilter) => {
    setFilters((prev) =>
      prev.isArchived === isArchived
        ? prev
        : { ...prev, isArchived, page: 1 },
    )
  }, [])

  const setPage = useCallback((page: number) => {
    setFilters((prev) => (prev.page === page ? prev : { ...prev, page }))
  }, [])

  const setLimit = useCallback((limit: number) => {
    setFilters((prev) =>
      prev.limit === limit ? prev : { ...prev, limit, page: 1 },
    )
  }, [])

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await listMerchCampaigns({
        page: filters.page,
        limit: filters.limit,
        q: filters.search.trim() || undefined,
        type: filters.type || undefined,
        isEnabled:
          filters.isEnabled === ''
            ? undefined
            : filters.isEnabled === 'true',
        isArchived:
          filters.isArchived === ''
            ? undefined
            : filters.isArchived === 'true',
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
  }, [filters])

  useEffect(() => {
    void refetch()
  }, [refetch])

  useEffect(() => {
    if (result) {
      const totalPages = Math.max(1, Math.ceil(result.total / filters.limit))
      if (filters.page > totalPages) {
        setPage(totalPages)
      }
    }
  }, [result, filters.page, filters.limit, setPage])

  return {
    search: filters.search,
    type: filters.type,
    isEnabled: filters.isEnabled,
    isArchived: filters.isArchived,
    page: filters.page,
    limit: filters.limit,
    result,
    loading,
    error,
    setSearch,
    setType,
    setEnabled,
    setArchived,
    setPage,
    setLimit,
    refetch,
  }
}
