import type {
  AdminUserDetail,
  AdminUserSummary,
  AppRole,
  PaginatedResult,
  UserListQuery,
  UserStatusChangeInput,
} from '@sabz/types'
import { request } from './api'

function buildListQuery(query: UserListQuery): string {
  const params = new URLSearchParams()
  if (query.page) {
    params.set('page', String(query.page))
  }
  if (query.limit) {
    params.set('limit', String(query.limit))
  }
  if (query.search) {
    params.set('search', query.search)
  }
  if (query.status) {
    params.set('status', query.status)
  }
  if (query.role) {
    params.set('role', query.role)
  }
  const qs = params.toString()
  return qs ? `/admin/users?${qs}` : '/admin/users'
}

export function listUsers(
  query: UserListQuery,
): Promise<PaginatedResult<AdminUserSummary>> {
  return request<PaginatedResult<AdminUserSummary>>(buildListQuery(query))
}

export function getUser(userId: string): Promise<AdminUserDetail> {
  return request<AdminUserDetail>(`/admin/users/${userId}`)
}

export function suspendUser(
  userId: string,
  input: UserStatusChangeInput,
): Promise<AdminUserDetail> {
  return request<AdminUserDetail>(`/admin/users/${userId}/suspend`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function unsuspendUser(userId: string): Promise<AdminUserDetail> {
  return request<AdminUserDetail>(`/admin/users/${userId}/unsuspend`, {
    method: 'PATCH',
  })
}

export function unlockUser(userId: string): Promise<AdminUserDetail> {
  return request<AdminUserDetail>(`/admin/users/${userId}/unlock`, {
    method: 'PATCH',
  })
}

export function assignRole(
  userId: string,
  role: AppRole,
): Promise<AdminUserDetail> {
  return request<AdminUserDetail>(`/admin/users/${userId}/roles/${role}`, {
    method: 'PUT',
  })
}

export function removeRole(
  userId: string,
  role: AppRole,
): Promise<AdminUserDetail> {
  return request<AdminUserDetail>(`/admin/users/${userId}/roles/${role}`, {
    method: 'DELETE',
  })
}
