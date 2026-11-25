/**
 * Admin pricing contract (SS-240B, master plan §5 item 12).
 *
 * Covers the three pricing models that drive `PricingService.resolveLine`:
 * category rules (Base → Rule), product overrides (Rule → Override) and
 * scheduled promotions (Bulk → Promotion). Money stays Rial verbatim
 * (SS-207 "O-1"), serialized as Decimal strings; windows are ISO strings
 * (null when open-ended on rules/overrides, always present on promotions).
 *
 * List responses reuse the shared `PaginatedResult` envelope (newest-first:
 * `createdAt DESC`, then `id DESC`).
 */

import type { PaginatedResult } from '../api/pagination';

export type PromotionType = 'PERCENT' | 'FIXED';

export const PROMOTION_TYPE_FA: Record<PromotionType, string> = {
  PERCENT: 'درصدی',
  FIXED: 'مبلغ ثابت (ریال)',
};

/** Category rule row (SS-235 B1 + pricing-grid spec §2.4). */
export interface CategoryPriceRuleDto {
  id: string;
  categoryId: string;
  categoryName: string;
  type: PromotionType;
  /** Rial (Decimal string): 0–100 for PERCENT, Rial amount for FIXED. */
  value: string;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  /** True = the rule also covers live descendant categories. */
  includeDescendants: boolean;
  priority: number;
  /** Derived lifecycle state for the admin list. */
  status: 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export type CategoryPriceRuleListResponse = PaginatedResult<CategoryPriceRuleDto>;

export interface CreateCategoryPriceRuleInput {
  categoryId: string;
  type: PromotionType;
  value: string;
  isActive?: boolean;
  startsAt?: string;
  endsAt?: string;
  includeDescendants?: boolean;
  priority?: number;
}

export interface UpdateCategoryPriceRuleInput {
  categoryId?: string;
  type?: PromotionType;
  value?: string;
  isActive?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  includeDescendants?: boolean;
  priority?: number;
}

/** Product override row (SS-235 B1): at most one per product. */
export interface ProductPriceOverrideDto {
  id: string;
  productId: string;
  productName: string;
  /** PERCENT/FIXED adjustment; null for an absolute override. */
  type: PromotionType | null;
  /** Rial (Decimal string): 0–100 for PERCENT, Rial amount for FIXED. */
  value: string | null;
  /** Absolute final retail price in Rial; null for an adjustment row. */
  overridePrice: string | null;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  status: 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export type ProductPriceOverrideListResponse = PaginatedResult<ProductPriceOverrideDto>;

export interface CreateProductPriceOverrideInput {
  productId: string;
  type?: PromotionType;
  value?: string;
  overridePrice?: string;
  isActive?: boolean;
  startsAt?: string;
  endsAt?: string;
}

export interface UpdateProductPriceOverrideInput {
  type?: PromotionType | null;
  value?: string | null;
  overridePrice?: string | null;
  isActive?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
}

/**
 * Scheduled promotion row (SS-235 A). Scope is optional and narrowest-wins:
 * productId > categoryId > brandId > sitewide (all null).
 */
export interface PromotionDto {
  id: string;
  code: string;
  titleFa: string;
  type: PromotionType;
  /** Rial (Decimal string): 0–100 for PERCENT, Rial amount for FIXED. */
  value: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  productId: string | null;
  categoryId: string | null;
  brandId: string | null;
  minQuantity: number;
  createdAt: string;
  updatedAt: string;
}

export type PromotionListResponse = PaginatedResult<PromotionDto>;

export interface CreatePromotionInput {
  code: string;
  titleFa: string;
  type: PromotionType;
  value: string;
  startsAt: string;
  endsAt: string;
  isActive?: boolean;
  productId?: string;
  categoryId?: string;
  brandId?: string;
  minQuantity?: number;
}

export interface UpdatePromotionInput {
  code?: string;
  titleFa?: string;
  type?: PromotionType;
  value?: string;
  startsAt?: string;
  endsAt?: string;
  isActive?: boolean;
  productId?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  minQuantity?: number;
}
