import type {
  AdminPartnerDetail,
  AdminPartnerListItem,
  ApprovePartnerInput,
  ChangePartnerTierInput,
  PaginatedResult,
  PartnerListQuery,
  PartnerTierSummary,
  RejectPartnerInput,
} from '@sabz/types'
import { request, requestBlob } from './api'

function buildListQuery(query: PartnerListQuery): string {
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
  return qs ? `/admin/partners?${qs}` : '/admin/partners'
}

export function listPartners(
  query: PartnerListQuery,
): Promise<PaginatedResult<AdminPartnerListItem>> {
  return request<PaginatedResult<AdminPartnerListItem>>(buildListQuery(query))
}

export function getPartner(partnerId: string): Promise<AdminPartnerDetail> {
  return request<AdminPartnerDetail>(`/admin/partners/${partnerId}`)
}

export function listTiers(): Promise<PartnerTierSummary[]> {
  return request<PartnerTierSummary[]>('/admin/partners/tiers')
}

export function approvePartner(
  partnerId: string,
  input: ApprovePartnerInput,
): Promise<AdminPartnerDetail> {
  return request<AdminPartnerDetail>(`/admin/partners/${partnerId}/approve`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function rejectPartner(
  partnerId: string,
  input: RejectPartnerInput,
): Promise<AdminPartnerDetail> {
  return request<AdminPartnerDetail>(`/admin/partners/${partnerId}/reject`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function changePartnerTier(
  partnerId: string,
  input: ChangePartnerTierInput,
): Promise<AdminPartnerDetail> {
  return request<AdminPartnerDetail>(`/admin/partners/${partnerId}/tier`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function downloadPartnerDocument(
  partnerId: string,
  documentId: string,
): Promise<Blob> {
  return requestBlob(`/admin/partners/${partnerId}/documents/${documentId}`)
}