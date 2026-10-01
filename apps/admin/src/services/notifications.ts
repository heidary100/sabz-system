import type {
  NotificationDto,
  NotificationListResponse,
  UnreadCountResponse,
} from '@sabz/types'
import { request } from './api'

export interface NotificationListQuery {
  unreadOnly?: boolean
  page?: number
  limit?: number
}

function buildListQuery(query: NotificationListQuery): string {
  const params = new URLSearchParams()
  if (query.unreadOnly) {
    params.set('unreadOnly', 'true')
  }
  if (query.page) {
    params.set('page', String(query.page))
  }
  if (query.limit) {
    params.set('limit', String(query.limit))
  }
  const qs = params.toString()
  return qs ? `/notifications?${qs}` : '/notifications'
}

export function listNotifications(
  query: NotificationListQuery,
): Promise<NotificationListResponse> {
  return request<NotificationListResponse>(buildListQuery(query))
}

export function unreadNotificationCount(): Promise<UnreadCountResponse> {
  return request<UnreadCountResponse>('/notifications/unread-count')
}

export function markNotificationRead(
  notificationId: string,
): Promise<NotificationDto> {
  return request<NotificationDto>(`/notifications/${notificationId}/read`, {
    method: 'PATCH',
  })
}
