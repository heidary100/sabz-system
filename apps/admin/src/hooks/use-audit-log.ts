import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuditEntry, AuditListQuery, PaginatedResult } from '@sabz/types'
import { listAudit } from '../services/audit'

export interface AuditLogFilters {
  actorId: string
  action: string
  entity: string
  entityId: string
  from: string
  to: string
  page: number
}

const DEFAULT_LIMIT = 20
const EMPTY_FILTERS: Omit<AuditLogFilters, 'page'> = {
  actorId: '',
  action: '',
  entity: '',
  entityId: '',
  from: '',
  to: '',
}

export function useAuditLog() {
  const [filters, setFilters] = useState<AuditLogFilters>({
    ...EMPTY_FILTERS,
    page: 1,
  })
  const [result, setResult] = useState<PaginatedResult<AuditEntry> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const setActorId = useCallback((actorId: string) => {
    setFilters((prev) => (prev.actorId === actorId ? prev : { ...prev, actorId, page: 1 }))
  }, [])

  const setAction = useCallback((action: string) => {
    setFilters((prev) => (prev.action === action ? prev : { ...prev, action, page: 1 }))
  }, [])

  const setEntity = useCallback((entity: string) => {
    setFilters((prev) => (prev.entity === entity ? prev : { ...prev, entity, page: 1 }))
  }, [])

  const setEntityId = useCallback((entityId: string) => {
    setFilters((prev) => (prev.entityId === entityId ? prev : { ...prev, entityId, page: 1 }))
  }, [])

  const setFrom = useCallback((from: string) => {
    setFilters((prev) => (prev.from === from ? prev : { ...prev, from, page: 1 }))
  }, [])

  const setTo = useCallback((to: string) => {
    setFilters((prev) => (prev.to === to ? prev : { ...prev, to, page: 1 }))
  }, [])

  const setPage = useCallback((page: number) => {
    setFilters((prev) => (prev.page === page ? prev : { ...prev, page }))
  }, [])

  const clearFilters = useCallback(() => {
    setFilters((prev) =>
      prev.actorId === '' &&
      prev.action === '' &&
      prev.entity === '' &&
      prev.entityId === '' &&
      prev.from === '' &&
      prev.to === '' &&
      prev.page === 1
        ? prev
        : { ...EMPTY_FILTERS, page: 1 },
    )
  }, [])

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    const query: AuditListQuery = {
      actorId: filters.actorId.trim() || undefined,
      action: filters.action || undefined,
      entity: filters.entity || undefined,
      entityId: filters.entityId.trim() || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      page: filters.page,
      limit: DEFAULT_LIMIT,
    }
    try {
      const data = await listAudit(query)
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
    actorId: filters.actorId,
    action: filters.action,
    entity: filters.entity,
    entityId: filters.entityId,
    from: filters.from,
    to: filters.to,
    page: filters.page,
    limit: DEFAULT_LIMIT,
    result,
    loading,
    error,
    setActorId,
    setAction,
    setEntity,
    setEntityId,
    setFrom,
    setTo,
    setPage,
    clearFilters,
    refetch,
  }
}
