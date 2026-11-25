import type {
  AttributeDto,
  AttributeValueDto,
  AttributeValueType,
  AttributeWithValuesDto,
  BulkAttributeApplyInput,
  BulkAttributeApplyResponse,
  BulkAttributeOperation,
  BulkAttributePreviewInput,
  BulkAttributePreviewResponse,
  CategoryAttributeInput,
  CategoryAttributesResponse,
  ProductAttributesResponse,
  ProductAttributeValueInput,
  SetProductAttributesInput,
} from '@sabz/types'
import { request } from './api'

export interface AttributePayload {
  name: string
  slug: string
  type: 'SPEC' | 'VARIANT_OPTION'
  valueType?: AttributeValueType
  group?: string
  unit?: string
  description?: string
  isFilterable?: boolean
  isGlobal?: boolean
  isComparable?: boolean
}

export function listAttributes(): Promise<{ items: AttributeWithValuesDto[] }> {
  return request<{ items: AttributeWithValuesDto[] }>('/admin/attributes')
}

export function createAttribute(input: AttributePayload): Promise<AttributeWithValuesDto> {
  return request<AttributeWithValuesDto>('/admin/attributes', {
    method: 'POST',
    body: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
  })
}

export function updateAttribute(
  id: string,
  input: Partial<AttributePayload>,
): Promise<AttributeWithValuesDto> {
  return request<AttributeWithValuesDto>(`/admin/attributes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
  })
}

export function deleteAttribute(id: string): Promise<void> {
  return request<void>(`/admin/attributes/${id}`, { method: 'DELETE' })
}

export function createAttributeValue(
  attributeId: string,
  input: {
    value: string
    slug: string
    numericValue?: string
    sortOrder?: number
    isActive?: boolean
  },
): Promise<AttributeValueDto> {
  return request<AttributeValueDto>(`/admin/attributes/${attributeId}/values`, {
    method: 'POST',
    body: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
  })
}

export function updateAttributeValue(
  id: string,
  input: {
    value?: string
    slug?: string
    numericValue?: string | null
    sortOrder?: number
    isActive?: boolean
  },
): Promise<AttributeValueDto> {
  return request<AttributeValueDto>(`/admin/attribute-values/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
  })
}

export function deleteAttributeValue(id: string): Promise<void> {
  return request<void>(`/admin/attribute-values/${id}`, { method: 'DELETE' })
}

export function getCategoryAttributes(
  categoryId: string,
): Promise<CategoryAttributesResponse> {
  return request<CategoryAttributesResponse>(
    `/admin/categories/${categoryId}/attributes`,
  )
}

export function setCategoryAttributes(
  categoryId: string,
  attributes: CategoryAttributeInput[],
): Promise<CategoryAttributesResponse> {
  return request<CategoryAttributesResponse>(
    `/admin/categories/${categoryId}/attributes`,
    {
      method: 'PUT',
      body: JSON.stringify({ attributes }),
      headers: { 'Content-Type': 'application/json' },
    },
  )
}

export function getProductAttributes(
  productId: string,
): Promise<ProductAttributesResponse> {
  return request<ProductAttributesResponse>(`/admin/products/${productId}/attributes`)
}

export function setProductAttributes(
  productId: string,
  input: SetProductAttributesInput,
): Promise<ProductAttributesResponse> {
  return request<ProductAttributesResponse>(`/admin/products/${productId}/attributes`, {
    method: 'PUT',
    body: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
  })
}

export function clearProductAttribute(
  productId: string,
  attributeId: string,
): Promise<ProductAttributesResponse> {
  return request<ProductAttributesResponse>(
    `/admin/products/${productId}/attributes/${attributeId}`,
    { method: 'DELETE' },
  )
}

export function previewBulkAttributes(
  input: BulkAttributePreviewInput,
): Promise<BulkAttributePreviewResponse> {
  return request<BulkAttributePreviewResponse>('/admin/products/bulk-attributes/preview', {
    method: 'POST',
    body: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
  })
}

export function applyBulkAttributes(
  input: BulkAttributeApplyInput,
): Promise<BulkAttributeApplyResponse> {
  return request<BulkAttributeApplyResponse>('/admin/products/bulk-attributes/apply', {
    method: 'POST',
    body: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
  })
}

export function attributeValueInput(
  item:
    | { attributeId: string; optionId: string }
    | { attributeId: string; optionIds: string[] }
    | { attributeId: string; valueText: string }
    | { attributeId: string; valueNumber: string }
    | { attributeId: string; valueBoolean: boolean },
): ProductAttributeValueInput {
  return item
}

export type AttributeOperation = BulkAttributeOperation
export type AttributeSummary = AttributeDto
