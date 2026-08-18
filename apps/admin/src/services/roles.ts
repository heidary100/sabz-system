import type { RoleSummary } from '@sabz/types'
import { request } from './api'

export function listRoles(): Promise<RoleSummary[]> {
  return request<RoleSummary[]>('/admin/roles')
}
