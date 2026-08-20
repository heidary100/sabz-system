import type {
  BrandListQuery,
  BrandSummary,
  CreateBrandInput,
  PaginatedResult,
  UpdateBrandInput,
} from '@sabz/types'
import { request } from './api'

function buildListQuery(query: BrandListQuery): string {
  const params = new URLSearchParams()
  if (query.page) {
    params.set('page', String(query.page))
  }
  if (query.limit) {
    params.set('limit', String(query.limit))
  }
  const qs = params.toString()
  return qs ? `/admin/brands?${qs}` : '/admin/brands'
}

export function listBrands(query: BrandListQuery): Promise<PaginatedResult<BrandSummary>> {
  return request<PaginatedResult<BrandSummary>>(buildListQuery(query))
}

export function getBrand(brandId: string): Promise<BrandSummary> {
  return request<BrandSummary>(`/admin/brands/${brandId}`)
}

export function createBrand(input: CreateBrandInput): Promise<BrandSummary> {
  return request<BrandSummary>('/admin/brands', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateBrand(
  brandId: string,
  input: UpdateBrandInput,
): Promise<BrandSummary> {
  return request<BrandSummary>(`/admin/brands/${brandId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteBrand(brandId: string): Promise<BrandSummary> {
  return request<BrandSummary>(`/admin/brands/${brandId}`, {
    method: 'DELETE',
  })
}
