import type {
  CategoryPriceRuleDto,
  CategoryPriceRuleListResponse,
  CreateCategoryPriceRuleInput,
  CreateProductPriceOverrideInput,
  CreatePromotionInput,
  ProductPriceOverrideDto,
  ProductPriceOverrideListResponse,
  PromotionDto,
  PromotionListResponse,
  UpdateCategoryPriceRuleInput,
  UpdateProductPriceOverrideInput,
  UpdatePromotionInput,
} from '@sabz/types'
import { request } from './api'

export interface PricingListQuery {
  isActive?: boolean
  page?: number
  limit?: number
}

function buildListQuery(base: string, query: PricingListQuery): string {
  const params = new URLSearchParams()
  if (query.isActive !== undefined) {
    params.set('isActive', String(query.isActive))
  }
  if (query.page) {
    params.set('page', String(query.page))
  }
  if (query.limit) {
    params.set('limit', String(query.limit))
  }
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

export function listCategoryRules(
  query: PricingListQuery,
): Promise<CategoryPriceRuleListResponse> {
  return request<CategoryPriceRuleListResponse>(
    buildListQuery('/admin/pricing/category-rules', query),
  )
}

export function getCategoryRule(ruleId: string): Promise<CategoryPriceRuleDto> {
  return request<CategoryPriceRuleDto>(`/admin/pricing/category-rules/${ruleId}`)
}

export function createCategoryRule(
  input: CreateCategoryPriceRuleInput,
): Promise<CategoryPriceRuleDto> {
  return request<CategoryPriceRuleDto>('/admin/pricing/category-rules', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateCategoryRule(
  ruleId: string,
  input: UpdateCategoryPriceRuleInput,
): Promise<CategoryPriceRuleDto> {
  return request<CategoryPriceRuleDto>(`/admin/pricing/category-rules/${ruleId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteCategoryRule(ruleId: string): Promise<CategoryPriceRuleDto> {
  return request<CategoryPriceRuleDto>(`/admin/pricing/category-rules/${ruleId}`, {
    method: 'DELETE',
  })
}

export function listProductOverrides(
  query: PricingListQuery,
): Promise<ProductPriceOverrideListResponse> {
  return request<ProductPriceOverrideListResponse>(
    buildListQuery('/admin/pricing/product-overrides', query),
  )
}

export function getProductOverride(overrideId: string): Promise<ProductPriceOverrideDto> {
  return request<ProductPriceOverrideDto>(`/admin/pricing/product-overrides/${overrideId}`)
}

export function createProductOverride(
  input: CreateProductPriceOverrideInput,
): Promise<ProductPriceOverrideDto> {
  return request<ProductPriceOverrideDto>('/admin/pricing/product-overrides', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateProductOverride(
  overrideId: string,
  input: UpdateProductPriceOverrideInput,
): Promise<ProductPriceOverrideDto> {
  return request<ProductPriceOverrideDto>(`/admin/pricing/product-overrides/${overrideId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteProductOverride(
  overrideId: string,
): Promise<ProductPriceOverrideDto> {
  return request<ProductPriceOverrideDto>(`/admin/pricing/product-overrides/${overrideId}`, {
    method: 'DELETE',
  })
}

export function listPromotions(query: PricingListQuery): Promise<PromotionListResponse> {
  return request<PromotionListResponse>(
    buildListQuery('/admin/pricing/promotions', query),
  )
}

export function getPromotion(promotionId: string): Promise<PromotionDto> {
  return request<PromotionDto>(`/admin/pricing/promotions/${promotionId}`)
}

export function createPromotion(input: CreatePromotionInput): Promise<PromotionDto> {
  return request<PromotionDto>('/admin/pricing/promotions', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updatePromotion(
  promotionId: string,
  input: UpdatePromotionInput,
): Promise<PromotionDto> {
  return request<PromotionDto>(`/admin/pricing/promotions/${promotionId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deletePromotion(promotionId: string): Promise<PromotionDto> {
  return request<PromotionDto>(`/admin/pricing/promotions/${promotionId}`, {
    method: 'DELETE',
  })
}
