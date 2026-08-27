import type {
  CreateVariantInput,
  UpdateVariantInput,
  VariantSummary,
} from '@sabz/types'
import { request } from './api'

export function listVariants(productId: string): Promise<VariantSummary[]> {
  return request<VariantSummary[]>(`/admin/products/${productId}/variants`)
}

export function createVariant(
  productId: string,
  input: CreateVariantInput,
): Promise<VariantSummary> {
  return request<VariantSummary>(`/admin/products/${productId}/variants`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateVariant(
  id: string,
  input: UpdateVariantInput,
): Promise<VariantSummary> {
  return request<VariantSummary>(`/admin/variants/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteVariant(id: string): Promise<VariantSummary> {
  return request<VariantSummary>(`/admin/variants/${id}`, {
    method: 'DELETE',
  })
}