import type {
  CreateWarehouseInput,
  PaginatedResult,
  UpdateWarehouseInput,
  WarehouseDetail,
  WarehouseListQuery,
  WarehouseSummary,
} from '@sabz/types'
import { request } from './api'

function buildListQuery(query: WarehouseListQuery): string {
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
  const qs = params.toString()
  return qs ? `/admin/warehouses?${qs}` : '/admin/warehouses'
}

export function listWarehouses(
  query: WarehouseListQuery,
): Promise<PaginatedResult<WarehouseSummary>> {
  return request<PaginatedResult<WarehouseSummary>>(buildListQuery(query))
}

export function getWarehouse(warehouseId: string): Promise<WarehouseDetail> {
  return request<WarehouseDetail>(`/admin/warehouses/${warehouseId}`)
}

export function createWarehouse(input: CreateWarehouseInput): Promise<WarehouseDetail> {
  return request<WarehouseDetail>('/admin/warehouses', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateWarehouse(
  warehouseId: string,
  input: UpdateWarehouseInput,
): Promise<WarehouseDetail> {
  return request<WarehouseDetail>(`/admin/warehouses/${warehouseId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function activateWarehouse(warehouseId: string): Promise<WarehouseDetail> {
  return request<WarehouseDetail>(`/admin/warehouses/${warehouseId}/activate`, {
    method: 'POST',
  })
}

export function deactivateWarehouse(warehouseId: string): Promise<WarehouseDetail> {
  return request<WarehouseDetail>(`/admin/warehouses/${warehouseId}/deactivate`, {
    method: 'POST',
  })
}