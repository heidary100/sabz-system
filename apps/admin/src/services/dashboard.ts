import type { DashboardSummary } from '@sabz/types'
import { request } from './api'

export function getDashboard(): Promise<DashboardSummary> {
  return request<DashboardSummary>('/admin/dashboard')
}