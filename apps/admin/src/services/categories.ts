import type {
  CategoryDetail,
  CategoryListQuery,
  CategorySummary,
  CategoryTreeNode,
  CreateCategoryInput,
  PaginatedResult,
  ReorderCategoryInput,
  UpdateCategoryInput,
} from '@sabz/types'
import { request } from './api'

function buildListQuery(query: CategoryListQuery): string {
  const params = new URLSearchParams()
  if (query.page) {
    params.set('page', String(query.page))
  }
  if (query.limit) {
    params.set('limit', String(query.limit))
  }
  const qs = params.toString()
  return qs ? `/admin/categories?${qs}` : '/admin/categories'
}

export function listCategories(
  query: CategoryListQuery,
): Promise<PaginatedResult<CategorySummary>> {
  return request<PaginatedResult<CategorySummary>>(buildListQuery(query))
}

export function getCategory(categoryId: string): Promise<CategoryDetail> {
  return request<CategoryDetail>(`/admin/categories/${categoryId}`)
}

export function fetchCategoryTree(): Promise<CategoryTreeNode[]> {
  return request<CategoryTreeNode[]>('/admin/categories/tree')
}

export function reorderCategory(
  categoryId: string,
  input: ReorderCategoryInput,
): Promise<CategoryDetail> {
  return request<CategoryDetail>(`/admin/categories/${categoryId}/reorder`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function createCategory(input: CreateCategoryInput): Promise<CategoryDetail> {
  return request<CategoryDetail>('/admin/categories', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateCategory(
  categoryId: string,
  input: UpdateCategoryInput,
): Promise<CategoryDetail> {
  return request<CategoryDetail>(`/admin/categories/${categoryId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteCategory(categoryId: string): Promise<CategoryDetail> {
  return request<CategoryDetail>(`/admin/categories/${categoryId}`, {
    method: 'DELETE',
  })
}
