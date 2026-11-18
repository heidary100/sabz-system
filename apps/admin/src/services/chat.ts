import type {
  AdminChatConversationDto,
  AdminChatConversationListResponse,
  ChatConversationStatus,
  ChatReadResponse,
  SendChatMessageInput,
} from '@sabz/types'
import { request } from './api'

export interface AdminChatListQuery {
  status?: ChatConversationStatus
  assigned?: 'me' | 'unassigned' | 'all'
  search?: string
  page?: number
  limit?: number
}

function queryString(query: AdminChatListQuery): string {
  const params = new URLSearchParams()
  if (query.status) params.set('status', query.status)
  if (query.assigned) params.set('assigned', query.assigned)
  if (query.search) params.set('search', query.search)
  if (query.page) params.set('page', String(query.page))
  if (query.limit) params.set('limit', String(query.limit))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function listAdminConversations(
  query: AdminChatListQuery,
): Promise<AdminChatConversationListResponse> {
  return request<AdminChatConversationListResponse>(
    `/admin/chat/conversations${queryString(query)}`,
  )
}

export function getAdminConversation(id: string): Promise<AdminChatConversationDto> {
  return request<AdminChatConversationDto>(
    `/admin/chat/conversations/${encodeURIComponent(id)}`,
  )
}

export function sendAdminMessage(
  id: string,
  input: SendChatMessageInput,
): Promise<AdminChatConversationDto> {
  return request<AdminChatConversationDto>(
    `/admin/chat/conversations/${encodeURIComponent(id)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
    },
  )
}

export function markAdminConversationRead(id: string): Promise<ChatReadResponse> {
  return request<ChatReadResponse>(
    `/admin/chat/conversations/${encodeURIComponent(id)}/read`,
    { method: 'POST' },
  )
}

export function updateAdminConversation(
  id: string,
  input: { status?: ChatConversationStatus; assignedToId?: string | null },
): Promise<AdminChatConversationDto> {
  return request<AdminChatConversationDto>(
    `/admin/chat/conversations/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
    },
  )
}

export function adminChatCounters(): Promise<{
  unreadConversations: number
  unassigned: number
}> {
  return request<{ unreadConversations: number; unassigned: number }>(
    '/admin/chat/unread-count',
  )
}
