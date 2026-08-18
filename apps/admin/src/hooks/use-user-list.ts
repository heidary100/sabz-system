import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AdminUserSummary,
  AppRole,
  PaginatedResult,
  UserListQuery,
  UserStatus,
} from '@sabz/types'
import { listUsers } from '../services/users'

export interface UserListFilters {
  search: string
  status: UserStatus | ''
  role: AppRole | ''
  page: number
}

const DEFAULT_LIMIT = 20

export function useUserList() {
  const [filters, setFilters] = useState<UserListFilters>({
    search: '',
    status: '',
    role: '',
    page: 1,
  })
  const [result, setResult] = useState<PaginatedResult<AdminUserSummary> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const setSearch = useCallback((search: string) => {
    setFilters((prev) => (prev.search === search ? prev : { ...prev, search, page: 1 }))
  }, [])

  const setStatus = useCallback((status: UserStatus | '') => {
    setFilters((prev) => (prev.status === status ? prev : { ...prev, status, page: 1 }))
  }, [])

  const setRole = useCallback((role: AppRole | '') => {
    setFilters((prev) => (prev.role === role ? prev : { ...prev, role, page: 1 }))
  }, [])

  const setPage = useCallback((page: number) => {
    setFilters((prev) => (prev.page === page ? prev : { ...prev, page }))
  }, [])

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    const query: UserListQuery = {
      search: filters.search.trim() || undefined,
      status: filters.status || undefined,
      role: filters.role || undefined,
      page: filters.page,
      limit: DEFAULT_LIMIT,
    }
    try {
      const data = await listUsers(query)
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
    if (result && filters.page > Math.max(1, Math.ceil(result.total / result.limit))) {
      setPage(Math.max(1, Math.ceil(result.total / result.limit)))
    }
  }, [result, filters.page, setPage])

  return {
    search: filters.search,
    status: filters.status,
    role: filters.role,
    page: filters.page,
    limit: DEFAULT_LIMIT,
    result,
    loading,
    error,
    setSearch,
    setStatus,
    setRole,
    setPage,
    refetch,
  }
}
