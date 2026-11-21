import type { PromotionType } from './pricing';

/**
 * Bulk financial pricing contract (pricing-grid spec §2.2, §2.4, §2.6, §8).
 *
 * Every operation must be previewed first. The preview token is a hash of the
 * resolved target set plus each target's concurrency token and current price
 * state; applying with a stale token is rejected (409) instead of silently
 * overwriting another administrator's edit.
 */
export type PricingScope =
  | { type: 'VARIANTS'; variantIds: string[] }
  | { type: 'PRODUCTS'; productIds: string[] }
  | { type: 'CATEGORY'; categoryId: string; includeDescendants: boolean };

export type BulkDiscountMode = 'FIXED' | 'PERCENT';

export type BulkPriceOperation =
  | { kind: 'APPLY_DISCOUNT'; mode: BulkDiscountMode; value: string }
  | { kind: 'CLEAR_DISCOUNT' }
  | {
      kind: 'ADJUST_REGULAR_PRICE';
      mode: 'PERCENT';
      value: string;
      direction: 'INCREASE' | 'DECREASE';
    }
  | {
      kind: 'SET_OVERRIDE';
      /** Absolute final Rial price. Mutually exclusive with type/value. */
      overridePrice?: string;
      type?: PromotionType;
      value?: string;
      startsAt?: string | null;
      endsAt?: string | null;
    }
  | { kind: 'CLEAR_OVERRIDE' };

export type BulkRowOutcome =
  | 'AFFECTED'
  | 'SKIPPED'
  | 'FAILED'
  | 'CONFLICT_CHANGED'
  | 'NOT_FOUND';

export interface BulkPriceRowPreview {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  categoryId: string;
  categoryName: string;
  priceStatus: string;
  regularPriceBefore: string;
  regularPriceAfter: string | null;
  discountedPriceBefore: string | null;
  discountedPriceAfter: string | null;
  effectivePriceBefore: string | null;
  effectivePriceAfter: string | null;
  expectedUpdatedAt: string;
  outcome: BulkRowOutcome;
  reason?: string;
  fieldErrors?: Record<string, string>;
}

export interface BulkPricePreviewRequest {
  scope: PricingScope;
  operation: BulkPriceOperation;
}

export interface BulkPricePreviewResponse {
  /** Opaque token required by apply; expires when any target changes. */
  previewToken: string;
  operation: BulkPriceOperation;
  scope: PricingScope;
  total: number;
  affected: number;
  skipped: number;
  failed: number;
  rows: BulkPriceRowPreview[];
  /** Human-readable warnings, e.g. category rules shadowed by a sale. */
  warnings: string[];
}

export interface BulkPriceApplyRequest extends BulkPricePreviewRequest {
  previewToken: string;
}

export interface BulkPriceApplyResultRow {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  outcome: BulkRowOutcome;
  reason?: string;
  regularPrice?: string;
  discountedPrice?: string | null;
  effectivePrice?: string | null;
  updatedAt?: string;
  priceUpdatedAt?: string;
  fieldErrors?: Record<string, string>;
}

export interface BulkPriceApplyResponse {
  /** True only when every target committed; bulk financial operations are atomic. */
  applied: boolean;
  summary: {
    requested: number;
    affected: number;
    skipped: number;
    failed: number;
  };
  results: BulkPriceApplyResultRow[];
  warnings: string[];
}

/** Category-rule preview (pricing-grid spec §2.4). */
export interface CategoryRulePreviewRequest {
  categoryId: string;
  includeDescendants: boolean;
  type: PromotionType;
  value: string;
  startsAt?: string | null;
  endsAt?: string | null;
  excludeProductIds?: string[];
}

export interface CategoryRulePreviewRow {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  categoryName: string;
  regularPrice: string;
  currentEffectivePrice: string | null;
  ruleEffectivePrice: string | null;
  outcome: 'AFFECTED' | 'SKIPPED' | 'FAILED';
  reason?: string;
}

export interface CategoryRulePreviewResponse {
  categoryId: string;
  includeDescendants: boolean;
  productCount: number;
  affected: number;
  skipped: number;
  failed: number;
  rows: CategoryRulePreviewRow[];
  /** Other active/scheduled rules covering the same category scope. */
  conflicts: Array<{
    id: string;
    categoryId: string;
    categoryName: string;
    type: PromotionType;
    value: string;
    includeDescendants: boolean;
    priority: number;
    status: string;
    startsAt: string | null;
    endsAt: string | null;
  }>;
  warnings: string[];
}

/** FX rate preview/recalculation (pricing-grid spec §3.2). */
export interface CurrencyRecalculationPreviewRequest {
  currency: 'USD' | 'AED';
  rialPerUnit: string;
  effectiveAt?: string;
}

export interface CurrencyRecalculationRow {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  sourceAmount: string;
  sourceDiscountAmount: string | null;
  currentRegularPrice: string;
  proposedRegularPrice: string;
  currentDiscountedPrice: string | null;
  proposedDiscountedPrice: string | null;
  expectedUpdatedAt: string;
  outcome: 'AFFECTED' | 'SKIPPED';
  reason?: string;
}

export interface CurrencyRecalculationPreviewResponse {
  previewToken: string;
  currency: 'USD' | 'AED';
  rialPerUnit: string;
  effectiveAt: string;
  total: number;
  affected: number;
  skipped: number;
  rows: CurrencyRecalculationRow[];
  warnings: string[];
}

export interface CurrencyRecalculationApplyRequest
  extends CurrencyRecalculationPreviewRequest {
  previewToken: string;
  note?: string;
}
