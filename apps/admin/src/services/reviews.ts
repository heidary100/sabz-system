import type {
  AdminReviewListResponse,
  ReviewDto,
  ReviewStatus,
} from '@sabz/types'
import { request } from './api'

export interface ReviewListQuery {
  status?: ReviewStatus | ''
  page?: number
  limit?: number
}

function buildListQuery(query: ReviewListQuery): string {
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
  return qs ? `/admin/reviews?${qs}` : '/admin/reviews'
}

export function listReviews(
  query: ReviewListQuery,
): Promise<AdminReviewListResponse> {
  return request<AdminReviewListResponse>(buildListQuery(query))
}

export function approveReview(reviewId: string): Promise<ReviewDto> {
  return request<ReviewDto>(`/reviews/${reviewId}/approve`, {
    method: 'PATCH',
  })
}

export function rejectReview(reviewId: string): Promise<ReviewDto> {
  return request<ReviewDto>(`/reviews/${reviewId}/reject`, {
    method: 'POST',
  })
}
