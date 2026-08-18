import type { AuditEntry, AuditListQuery, PaginatedResult } from '@sabz/types'
import { request } from './api'

function buildAuditQuery(query: AuditListQuery): string {
  const params = new URLSearchParams()
  if (query.page) {
    params.set('page', String(query.page))
  }
  if (query.limit) {
    params.set('limit', String(query.limit))
  }
  if (query.actorId) {
    params.set('actorId', query.actorId)
  }
  if (query.action) {
    params.set('action', query.action)
  }
  if (query.entity) {
    params.set('entity', query.entity)
  }
  if (query.entityId) {
    params.set('entityId', query.entityId)
  }
  if (query.from) {
    params.set('from', query.from)
  }
  if (query.to) {
    params.set('to', query.to)
  }
  const qs = params.toString()
  return qs ? `/admin/audit?${qs}` : '/admin/audit'
}

export function listAudit(
  query: AuditListQuery,
): Promise<PaginatedResult<AuditEntry>> {
  return request<PaginatedResult<AuditEntry>>(buildAuditQuery(query))
}
