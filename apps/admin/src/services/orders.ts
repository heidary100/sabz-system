import type {
  AdminOrderDetailDto,
  AdminOrderListResponse,
  AdminOrderTransition,
  OrderStatus,
} from '@sabz/types'
import { request } from './api'

export interface OrderListQuery {
  status?: OrderStatus | ''
  page?: number
  limit?: number
}

function buildListQuery(query: OrderListQuery): string {
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
  return qs ? `/admin/orders?${qs}` : '/admin/orders'
}

export function listOrders(query: OrderListQuery): Promise<AdminOrderListResponse> {
  return request<AdminOrderListResponse>(buildListQuery(query))
}

export function getOrder(orderId: string): Promise<AdminOrderDetailDto> {
  return request<AdminOrderDetailDto>(`/admin/orders/${orderId}`)
}

export function transitionOrder(
  orderId: string,
  status: AdminOrderTransition,
): Promise<AdminOrderDetailDto> {
  return request<AdminOrderDetailDto>(`/admin/orders/${orderId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}
