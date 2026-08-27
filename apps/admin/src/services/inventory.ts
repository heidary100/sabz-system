import type {
  AdjustInventoryInput,
  InventoryItemSummary,
  InventoryListQuery,
  InventoryMovementSummary,
  MovementListQuery,
  PaginatedResult,
  ReceiveStockInput,
  ReservationListQuery,
  ReservationSummary,
  ReserveInventoryInput,
  WarehouseSummary,
} from '@sabz/types'
import { request } from './api'

function buildInventoryListQuery(query: InventoryListQuery): string {
  const params = new URLSearchParams()
  if (query.page) {
    params.set('page', String(query.page))
  }
  if (query.limit) {
    params.set('limit', String(query.limit))
  }
  if (query.variantId) {
    params.set('variantId', query.variantId)
  }
  if (query.warehouseId) {
    params.set('warehouseId', query.warehouseId)
  }
  if (query.stockStatus) {
    params.set('stockStatus', query.stockStatus)
  }
  if (query.search) {
    params.set('search', query.search)
  }
  const qs = params.toString()
  return qs ? `/admin/inventory?${qs}` : '/admin/inventory'
}

function buildMovementListQuery(query: MovementListQuery): string {
  const params = new URLSearchParams()
  if (query.page) {
    params.set('page', String(query.page))
  }
  if (query.limit) {
    params.set('limit', String(query.limit))
  }
  if (query.variantId) {
    params.set('variantId', query.variantId)
  }
  if (query.warehouseId) {
    params.set('warehouseId', query.warehouseId)
  }
  if (query.type) {
    params.set('type', query.type)
  }
  if (query.from) {
    params.set('from', query.from)
  }
  if (query.to) {
    params.set('to', query.to)
  }
  const qs = params.toString()
  return qs ? `/admin/inventory/movements?${qs}` : '/admin/inventory/movements'
}

function buildReservationListQuery(query: ReservationListQuery): string {
  const params = new URLSearchParams()
  if (query.page) {
    params.set('page', String(query.page))
  }
  if (query.limit) {
    params.set('limit', String(query.limit))
  }
  if (query.status) {
    params.set('status', query.status)
  }
  if (query.variantId) {
    params.set('variantId', query.variantId)
  }
  if (query.warehouseId) {
    params.set('warehouseId', query.warehouseId)
  }
  const qs = params.toString()
  return qs ? `/admin/inventory/reservations?${qs}` : '/admin/inventory/reservations'
}

export function listInventory(
  query: InventoryListQuery,
): Promise<PaginatedResult<InventoryItemSummary>> {
  return request<PaginatedResult<InventoryItemSummary>>(
    buildInventoryListQuery(query),
  )
}

export function listVariantInventory(
  variantId: string,
): Promise<InventoryItemSummary[]> {
  return request<InventoryItemSummary[]>(
    `/admin/inventory/variants/${variantId}`,
  )
}

export function listWarehouseInventory(
  warehouseId: string,
  query: { page?: number; limit?: number },
): Promise<PaginatedResult<InventoryItemSummary>> {
  const params = new URLSearchParams()
  if (query.page) {
    params.set('page', String(query.page))
  }
  if (query.limit) {
    params.set('limit', String(query.limit))
  }
  const qs = params.toString()
  return request<PaginatedResult<InventoryItemSummary>>(
    `/admin/warehouses/${warehouseId}/inventory${qs ? `?${qs}` : ''}`,
  )
}

export function listWarehouseOptions(): Promise<WarehouseSummary[]> {
  return request<WarehouseSummary[]>('/admin/inventory/warehouses')
}

export function receiveInventory(
  input: ReceiveStockInput,
): Promise<InventoryItemSummary> {
  return request<InventoryItemSummary>('/admin/inventory/receive', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function adjustInventory(
  input: AdjustInventoryInput,
): Promise<InventoryItemSummary> {
  return request<InventoryItemSummary>('/admin/inventory/adjust', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function listInventoryMovements(
  query: MovementListQuery,
): Promise<PaginatedResult<InventoryMovementSummary>> {
  return request<PaginatedResult<InventoryMovementSummary>>(
    buildMovementListQuery(query),
  )
}

export function listReservations(
  query: ReservationListQuery,
): Promise<PaginatedResult<ReservationSummary>> {
  return request<PaginatedResult<ReservationSummary>>(
    buildReservationListQuery(query),
  )
}

export function reserveInventory(
  input: ReserveInventoryInput,
): Promise<ReservationSummary> {
  return request<ReservationSummary>('/admin/inventory/reserve', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function releaseReservation(id: string): Promise<ReservationSummary> {
  return request<ReservationSummary>(
    `/admin/inventory/reservations/${id}/release`,
    { method: 'POST' },
  )
}

export function consumeReservation(id: string): Promise<ReservationSummary> {
  return request<ReservationSummary>(
    `/admin/inventory/reservations/${id}/consume`,
    { method: 'POST' },
  )
}