import type {
  CreatePartnerTierInput,
  PartnerTierSummary,
  UpdatePartnerTierInput,
} from '@sabz/types'
import { request } from './api'

/**
 * Partner-tier admin CRUD (SS-042 follow-up, #90). Routes live on the
 * partners controller next to the pre-existing `GET /admin/partners/tiers`
 * (the approval flow consumes the same list).
 */
export function listPartnerTiers(): Promise<PartnerTierSummary[]> {
  return request<PartnerTierSummary[]>('/admin/partners/tiers')
}

export function createPartnerTier(
  input: CreatePartnerTierInput,
): Promise<PartnerTierSummary> {
  return request<PartnerTierSummary>('/admin/partners/tiers', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updatePartnerTier(
  tierId: string,
  input: UpdatePartnerTierInput,
): Promise<PartnerTierSummary> {
  return request<PartnerTierSummary>(`/admin/partners/tiers/${tierId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deletePartnerTier(tierId: string): Promise<void> {
  return request<void>(`/admin/partners/tiers/${tierId}`, {
    method: 'DELETE',
  })
}
