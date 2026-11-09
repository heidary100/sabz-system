import type {
  CreateHomepagePublicationInput,
  CreateMerchCampaignInput,
  HomepageDraftDto,
  HomepageDraftValidationResult,
  HomepagePublicationDto,
  HomepagePublicationListQuery,
  HomepagePublicationListResponse,
  MerchCampaignDto,
  MerchCampaignListQuery,
  MerchCampaignListResponse,
  MerchMediaDetailDto,
  MerchMediaListResponse,
  MerchMediaSummaryDto,
  RollbackHomepagePublicationInput,
  UpdateHomepageDraftInput,
  UpdateMerchCampaignInput,
  UpdateMerchMediaInput,
  ValidateHomepageDraftInput,
} from '@sabz/types'
import {
  request,
  requestBlob,
  requestMultipart,
  requestMultipartWithProgress,
} from './api'

/**
 * Admin merchandising service foundations (SS-273).
 *
 * Every call goes through the shared API gateway so bearer injection, refresh,
 * retry, and session clearing stay centralized. Query builders only forward
 * caller-supplied parameters — no backend fields are invented here.
 */

/** Media list query contract (the shared media types expose responses only). */
export interface MerchMediaListQuery {
  page?: number
  limit?: number
  q?: string
  isPublished?: boolean
}

function withQuery(path: string, params: URLSearchParams): string {
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

export function buildCampaignListQuery(
  query: MerchCampaignListQuery = {},
): string {
  const params = new URLSearchParams()
  if (query.page !== undefined) {
    params.set('page', String(query.page))
  }
  if (query.limit !== undefined) {
    params.set('limit', String(query.limit))
  }
  if (query.q) {
    params.set('q', query.q)
  }
  if (query.type) {
    params.set('type', query.type)
  }
  if (query.isEnabled !== undefined) {
    params.set('isEnabled', String(query.isEnabled))
  }
  if (query.isArchived !== undefined) {
    params.set('isArchived', String(query.isArchived))
  }
  return withQuery('/admin/merchandising/campaigns', params)
}

export function buildMediaListQuery(query: MerchMediaListQuery = {}): string {
  const params = new URLSearchParams()
  if (query.page !== undefined) {
    params.set('page', String(query.page))
  }
  if (query.limit !== undefined) {
    params.set('limit', String(query.limit))
  }
  if (query.q) {
    params.set('q', query.q)
  }
  if (query.isPublished !== undefined) {
    params.set('isPublished', String(query.isPublished))
  }
  return withQuery('/admin/merchandising/media', params)
}

export function buildPublicationListQuery(
  query: HomepagePublicationListQuery = {},
): string {
  const params = new URLSearchParams()
  if (query.page !== undefined) {
    params.set('page', String(query.page))
  }
  if (query.limit !== undefined) {
    params.set('limit', String(query.limit))
  }
  if (query.status) {
    params.set('status', query.status)
  }
  return withQuery('/admin/merchandising/homepage/publications', params)
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export function listMerchCampaigns(
  query: MerchCampaignListQuery = {},
): Promise<MerchCampaignListResponse> {
  return request<MerchCampaignListResponse>(buildCampaignListQuery(query))
}

export function getMerchCampaign(id: string): Promise<MerchCampaignDto> {
  return request<MerchCampaignDto>(`/admin/merchandising/campaigns/${id}`)
}

export function createMerchCampaign(
  input: CreateMerchCampaignInput,
): Promise<MerchCampaignDto> {
  return request<MerchCampaignDto>('/admin/merchandising/campaigns', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateMerchCampaign(
  id: string,
  input: UpdateMerchCampaignInput,
): Promise<MerchCampaignDto> {
  return request<MerchCampaignDto>(`/admin/merchandising/campaigns/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function enableMerchCampaign(id: string): Promise<MerchCampaignDto> {
  return request<MerchCampaignDto>(
    `/admin/merchandising/campaigns/${id}/enable`,
    { method: 'POST' },
  )
}

export function disableMerchCampaign(id: string): Promise<MerchCampaignDto> {
  return request<MerchCampaignDto>(
    `/admin/merchandising/campaigns/${id}/disable`,
    { method: 'POST' },
  )
}

export function archiveMerchCampaign(id: string): Promise<MerchCampaignDto> {
  return request<MerchCampaignDto>(
    `/admin/merchandising/campaigns/${id}/archive`,
    { method: 'POST' },
  )
}

// ---------------------------------------------------------------------------
// Merchandising media
// ---------------------------------------------------------------------------

export interface UploadMerchMediaOptions {
  altFa?: string | null
  /** Reports only the browser upload phase; server processing is separate. */
  onProgress?: (percent: number) => void
}

export function listMerchMedia(
  query: MerchMediaListQuery = {},
): Promise<MerchMediaListResponse> {
  return request<MerchMediaListResponse>(buildMediaListQuery(query))
}

export function getMerchMedia(id: string): Promise<MerchMediaDetailDto> {
  return request<MerchMediaDetailDto>(`/admin/merchandising/media/${id}`)
}

export function uploadMerchMedia(
  file: File,
  options: UploadMerchMediaOptions = {},
): Promise<MerchMediaSummaryDto> {
  const formData = new FormData()
  formData.append('file', file)
  const altFa = options.altFa?.trim()
  if (altFa) {
    formData.append('altFa', altFa)
  }

  const path = '/admin/merchandising/media'
  if (options.onProgress) {
    return requestMultipartWithProgress<MerchMediaSummaryDto>(
      path,
      formData,
      options.onProgress,
    )
  }
  return requestMultipart<MerchMediaSummaryDto>(path, formData)
}

export function updateMerchMedia(
  id: string,
  input: UpdateMerchMediaInput,
): Promise<MerchMediaSummaryDto> {
  return request<MerchMediaSummaryDto>(`/admin/merchandising/media/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteMerchMedia(id: string): Promise<MerchMediaSummaryDto> {
  return request<MerchMediaSummaryDto>(`/admin/merchandising/media/${id}`, {
    method: 'DELETE',
  })
}

/** Authenticated original file; never use the public storefront URL here. */
export function getMerchMediaFile(id: string): Promise<Blob> {
  return requestBlob(`/admin/merchandising/media/${id}/file`)
}

/** Authenticated WebP thumbnail for admin previews. */
export function getMerchMediaThumbnail(id: string): Promise<Blob> {
  return requestBlob(`/admin/merchandising/media/${id}/thumbnail`)
}

// ---------------------------------------------------------------------------
// Homepage draft
// ---------------------------------------------------------------------------

export function getHomepageDraft(): Promise<HomepageDraftDto> {
  return request<HomepageDraftDto>('/admin/merchandising/homepage/draft')
}

export function replaceHomepageDraft(
  input: UpdateHomepageDraftInput,
): Promise<HomepageDraftDto> {
  return request<HomepageDraftDto>('/admin/merchandising/homepage/draft', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function validateHomepageDraft(
  input: ValidateHomepageDraftInput = {},
): Promise<HomepageDraftValidationResult> {
  return request<HomepageDraftValidationResult>(
    '/admin/merchandising/homepage/draft/validate',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
}

// ---------------------------------------------------------------------------
// Homepage publications
// ---------------------------------------------------------------------------

export function listHomepagePublications(
  query: HomepagePublicationListQuery = {},
): Promise<HomepagePublicationListResponse> {
  return request<HomepagePublicationListResponse>(
    buildPublicationListQuery(query),
  )
}

export function getHomepagePublication(
  id: string,
): Promise<HomepagePublicationDto> {
  return request<HomepagePublicationDto>(
    `/admin/merchandising/homepage/publications/${id}`,
  )
}

export function createHomepagePublication(
  input: CreateHomepagePublicationInput = {},
): Promise<HomepagePublicationDto> {
  return request<HomepagePublicationDto>(
    '/admin/merchandising/homepage/publications',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
}

export function cancelHomepagePublication(
  id: string,
): Promise<HomepagePublicationDto> {
  return request<HomepagePublicationDto>(
    `/admin/merchandising/homepage/publications/${id}/cancel`,
    { method: 'POST' },
  )
}

export function rollbackHomepagePublication(
  id: string,
  input: RollbackHomepagePublicationInput = {},
): Promise<HomepagePublicationDto> {
  return request<HomepagePublicationDto>(
    `/admin/merchandising/homepage/publications/${id}/rollback`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
}
