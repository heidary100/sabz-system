import type {
  CatalogGridBatchInput,
  CatalogGridBatchResponse,
  CatalogGridListQuery,
  CatalogGridListResponse,
} from '@sabz/types'
import { request } from './api'

function buildListQuery(query: CatalogGridListQuery): string {
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
