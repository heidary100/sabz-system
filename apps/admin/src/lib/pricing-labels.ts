import type { PromotionDto, PromotionType } from '@sabz/types'

/**
 * Local Persian labels (SS-240B). The admin keeps runtime label maps in
 * `lib/*-labels.ts` (order-labels pattern) and imports only *types* from
 * `@sabz/types`: the package ships a CJS dist, which Vite dev serves raw
 * via /@fs where named ESM imports fail at runtime.
 */
export const PROMOTION_TYPE_LABELS: Record<PromotionType, string> = {
  PERCENT: 'درصدی',
  FIXED: 'مبلغ ثابت',
}

export const ACTIVE_LABELS = {
  active: 'فعال',
  inactive: 'غیرفعال',
} as const

export type PricingTab = 'rules' | 'overrides' | 'promotions' | 'tiers'

export const PRICING_TAB_LABELS: Record<PricingTab, string> = {
  rules: 'قوانین دسته‌بندی',
  overrides: 'اورراید محصول',
  promotions: 'پروموشن‌ها',
  tiers: 'پله‌های همکاری',
}

export const PRICING_TABS: PricingTab[] = ['rules', 'overrides', 'promotions', 'tiers']

export type PricingActiveFilter = '' | 'active' | 'inactive'

export const PRICING_ACTIVE_FILTER_LABELS: Record<PricingActiveFilter, string> = {
  '': 'همه وضعیت‌ها',
  active: 'فقط فعال‌ها',
  inactive: 'فقط غیرفعال‌ها',
}

/** Promotion scope label from the nullable FK trio (all null = sitewide). */
export function promotionScopeLabel(promotion: Pick<PromotionDto, 'productId' | 'categoryId' | 'brandId'>): string {
  if (promotion.productId) {
    return 'محصول'
  }
  if (promotion.categoryId) {
    return 'دسته‌بندی'
  }
  if (promotion.brandId) {
    return 'برند'
  }
  return 'سراسری'
}

/** PERCENT shows ٪; FIXED rows use `formatRial` from lib/format. */
export function formatPercentValue(value: string): string {
  return `٪${value}`
}
