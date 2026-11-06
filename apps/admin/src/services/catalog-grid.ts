import type {
  CatalogGridBatchInput,
  CatalogGridBatchResponse,
  CatalogGridListQuery,
  CatalogGridListResponse,
} from '@sabz/types'
import { request } from './api'

/**
 * Serializes the grid list query to the API's query string (SS-257). The
 * param names must match `ListCatalogGridQueryDto` exactly — every field the
 * hook offers must survive this boundary. Exported for a serialization unit
 * test so a hook/service contract split can never silently drop filters
 * again (the v2 regression: sort/multi-select/price/stock params existed in
 * the hook but were dropped here, and only live-browser testing caught it).
 */
export function buildListQuery(query: CatalogGridListQuery): string {
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
  if (query.sku) {
    params.set('sku', query.sku)
  }
  if (query.status) {
    params.set('status', query.status)
  }
  if (query.categoryId) {
    params.set('categoryId', query.categoryId)
  }
  if (query.brandId) {
    params.set('brandId', query.brandId)
  }
  if (query.statuses && query.statuses.length > 0) {
    params.set('statuses', query.statuses.join(','))
  }
  if (query.categoryIds && query.categoryIds.length > 0) {
    params.set('categoryIds', query.categoryIds.join(','))
  }
  if (query.brandIds && query.brandIds.length > 0) {
    params.set('brandIds', query.brandIds.join(','))
  }
  if (query.priceStatus) {
    params.set('priceStatus', query.priceStatus)
  }
  if (query.condition) {
    params.set('condition', query.condition)
  }
  if (query.minPrice) {
    params.set('minPrice', query.minPrice)
  }
  if (query.maxPrice) {
    params.set('maxPrice', query.maxPrice)
  }
  if (query.stockStatus) {
    params.set('stockStatus', query.stockStatus)
  }
  if (query.sortBy) {
    params.set('sortBy', query.sortBy)
  }
  if (query.sortDir) {
    params.set('sortDir', query.sortDir)
  }
  const qs = params.toString()
  return qs ? `/admin/catalog-grid?${qs}` : '/admin/catalog-grid'
}

export function listCatalogGrid(
  query: CatalogGridListQuery,
): Promise<CatalogGridListResponse> {
  return request<CatalogGridListResponse>(buildListQuery(query))
}

export function batchUpdateCatalogGrid(
  input: CatalogGridBatchInput,
): Promise<CatalogGridBatchResponse> {
  return request<CatalogGridBatchResponse>('/admin/catalog-grid/batch', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
