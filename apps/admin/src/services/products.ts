import type {
  CreateProductInput,
  PaginatedResult,
  ProductDetail,
  ProductListQuery,
  ProductSummary,
  UpdateProductInput,
} from '@sabz/types'
import { request } from './api'

function buildListQuery(query: ProductListQuery): string {
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
  if (query.categoryId) {
    params.set('categoryId', query.categoryId)
  }
  if (query.brandId) {
    params.set('brandId', query.brandId)
  }
  const qs = params.toString()
  return qs ? `/admin/products?${qs}` : '/admin/products'
}

export function listProducts(
  query: ProductListQuery,
): Promise<PaginatedResult<ProductSummary>> {
  return request<PaginatedResult<ProductSummary>>(buildListQuery(query))
}

export function getProduct(productId: string): Promise<ProductDetail> {
  return request<ProductDetail>(`/admin/products/${productId}`)
}

export function createProduct(input: CreateProductInput): Promise<ProductDetail> {
  return request<ProductDetail>('/admin/products', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateProduct(
  productId: string,
  input: UpdateProductInput,
): Promise<ProductDetail> {
  return request<ProductDetail>(`/admin/products/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function publishProduct(productId: string): Promise<ProductDetail> {
  return request<ProductDetail>(`/admin/products/${productId}/publish`, {
    method: 'POST',
  })
}

export function archiveProduct(productId: string): Promise<ProductDetail> {
  return request<ProductDetail>(`/admin/products/${productId}/archive`, {
    method: 'POST',
  })
}

export function deleteProduct(productId: string): Promise<ProductDetail> {
  return request<ProductDetail>(`/admin/products/${productId}`, {
    method: 'DELETE',
  })
}
