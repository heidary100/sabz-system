import type {
  QuoteRfqInput,
  RfqDto,
  RfqListResponse,
  RfqStatus,
} from '@sabz/types'
import { request } from './api'

export interface RfqListQuery {
  status?: RfqStatus | ''
  page?: number
  limit?: number
}

function buildListQuery(query: RfqListQuery): string {
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
  return qs ? `/rfq?${qs}` : '/rfq'
}

export function listRfqs(query: RfqListQuery): Promise<RfqListResponse> {
  return request<RfqListResponse>(buildListQuery(query))
}

export function getRfq(rfqId: string): Promise<RfqDto> {
  return request<RfqDto>(`/rfq/${rfqId}`)
}

export function quoteRfq(rfqId: string, input: QuoteRfqInput): Promise<RfqDto> {
  return request<RfqDto>(`/rfq/${rfqId}/quote`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function rejectRfq(rfqId: string): Promise<RfqDto> {
  return request<RfqDto>(`/rfq/${rfqId}/reject`, {
    method: 'POST',
  })
}
