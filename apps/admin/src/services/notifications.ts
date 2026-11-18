import type {
  MarkAllNotificationsReadResponse,
  NotificationDto,
  NotificationListResponse,
  NotificationPreferenceDto,
  PushConfigResponse,
  PushSubscriptionInput,
  UnreadCountResponse,
  UpdateNotificationPreferenceInput,
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

export function markAllNotificationsRead(): Promise<MarkAllNotificationsReadResponse> {
  return request<MarkAllNotificationsReadResponse>('/notifications/read-all', {
    method: 'POST',
  })
}

export function notificationPreferences(): Promise<NotificationPreferenceDto> {
  return request<NotificationPreferenceDto>('/notifications/preferences')
}

export function updateNotificationPreferences(
  input: UpdateNotificationPreferenceInput,
): Promise<NotificationPreferenceDto> {
  return request<NotificationPreferenceDto>('/notifications/preferences', {
    method: 'PATCH',
    body: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
  })
}

export function pushConfig(): Promise<PushConfigResponse> {
  return request<PushConfigResponse>('/notifications/push/config')
}

export function subscribePush(
  input: PushSubscriptionInput,
): Promise<{ subscribed: true }> {
  return request<{ subscribed: true }>('/notifications/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
  })
}

export function unsubscribePush(
  endpoint: string,
): Promise<{ removed: number }> {
  return request<{ removed: number }>('/notifications/push/subscribe', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
    headers: { 'Content-Type': 'application/json' },
  })
}
