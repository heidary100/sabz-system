import type { ProfileResponse, UpdateProfileInput } from '@sabz/types'
import { request } from './api'

/** Self-scoped authenticated profile (never another user's data). */
export function getMyProfile(): Promise<ProfileResponse> {
  return request<ProfileResponse>('/auth/profile')
}

/**
 * Updates only the fields the server permits for self-edit. Roles, status,
 * mobile/authentication identifiers and other users are not addressable
 * through this endpoint.
 */
export function updateMyProfile(
  input: UpdateProfileInput,
): Promise<ProfileResponse> {
  return request<ProfileResponse>('/auth/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}
