import type {
  AdminReturnDetailDto,
  AdminReturnListResponse,
  ReturnStatus,
} from '@sabz/types'
import { request } from './api'

export interface ReturnListQuery {
  status?: ReturnStatus | ''
  page?: number
  limit?: number
}

function buildListQuery(query: ReturnListQuery): string {
  const params = new URLSearchParams()
  if (query.status) {
    params.set('status', query.status)
  }
  if (query.page) {
    params.set('page', String(query.page))
  }
  if (query.limit) {
    params.set('limit', String(query.limit))
  }
  const qs = params.toString()
  return qs ? `/admin/returns?${qs}` : '/admin/returns'
}

export function listReturns(
  query: ReturnListQuery,
): Promise<AdminReturnListResponse> {
  return request<AdminReturnListResponse>(buildListQuery(query))
}

export function getReturn(returnId: string): Promise<AdminReturnDetailDto> {
  return request<AdminReturnDetailDto>(`/admin/returns/${returnId}`)
}

export function approveReturn(returnId: string): Promise<AdminReturnDetailDto> {
  return request<AdminReturnDetailDto>(`/admin/returns/${returnId}/approve`, {
    method: 'POST',
  })
}

export function rejectReturn(
  returnId: string,
  reason: string,
): Promise<AdminReturnDetailDto> {
  return request<AdminReturnDetailDto>(`/admin/returns/${returnId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export function receiveReturn(returnId: string): Promise<AdminReturnDetailDto> {
  return request<AdminReturnDetailDto>(`/admin/returns/${returnId}/receive`, {
    method: 'POST',
  })
}

export function completeReturn(
  returnId: string,
): Promise<AdminReturnDetailDto> {
  return request<AdminReturnDetailDto>(`/admin/returns/${returnId}/complete`, {
    method: 'POST',
  })
}
