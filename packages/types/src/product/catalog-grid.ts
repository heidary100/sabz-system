import type { PaginatedResult } from '../api/pagination';
import type { PriceStatus, ProductCondition, ProductStatus } from './type';

/**
 * SS-257 admin catalog grid. One editable row = one ProductVariant.
 * Price/discountedPrice/priceStatus/sku/barcode/name live on the variant;
 * `regularPrice` is the alias of `price` used by the pricing UI to avoid
 * confusing the regular and sale amounts. `stock` is the aggregate
 * quantityOnHand across qualifying warehouses (never persisted — same
 * derivation as the inventory read API). `expectedUpdatedAt` is the
 * optimistic-concurrency token the admin echoes back on batch save.
 */
export interface CatalogGridRow {
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  productStatus: ProductStatus;
  condition: ProductCondition;
  createdAt: string;
  sku: string;
  barcode: string | null;
  /** Variant display label (variant.name). */
  variantName: string | null;
  brandName: string | null;
  /** SS-270 ids for inline product editing. */
  brandId: string | null;
  categoryId: string;
  categoryName: string;
  thumbnailUrl: string | null;
  priceStatus: PriceStatus;
  /** Regular/base price in Rial (alias of the stored `price`). */
  regularPrice: string;
  /** Promotional selling price in Rial; null when no sale. */
  discountedPrice: string | null;
  discountStartsAt: string | null;
  discountEndsAt: string | null;
  /** B2B partner price in Rial; null when not set. */
  partnerPrice: string | null;
  /** Server-computed customer-facing price (active sale/category/override). */
  effectivePrice: string | null;
  /** Human-readable active price source (regular/sale/category/override). */
  priceSource: 'REGULAR' | 'SALE' | 'CATEGORY_RULE' | 'OVERRIDE' | 'PARTNER_TIER' | null;
  /** Last price/rate calculation timestamp. */
  priceUpdatedAt: string | null;
  priceSourceCurrency: 'RIAL' | 'USD' | 'AED';
  /** Derived admin-only amounts using the current manual rates. */
  aedPrice: string | null;
  usdPrice: string | null;
  /** Active product override summary, when one exists. */
  override: {
    id: string;
    type: 'PERCENT' | 'FIXED' | null;
    value: string | null;
    overridePrice: string | null;
    isActive: boolean;
    startsAt: string | null;
    endsAt: string | null;
  } | null;
  stock: number;
  /** Inline stock editing allowed only when exactly one qualifying warehouse holds the variant. */
  stockEditable: boolean;
  expectedUpdatedAt: string;
  /** Product-level optimistic-concurrency token (SS-270). */
  productUpdatedAt: string;
}

export interface CatalogGridListQuery {
  /** Global search: product name/slug, brand name/nameEn, category name, SKU. */
  search?: string;
  /** Dedicated SKU filter (case-insensitive contains). */
  sku?: string;
  status?: ProductStatus;
  categoryId?: string;
  brandId?: string;
  /** Multi-select filters (comma-separated in the query string). */
  statuses?: ProductStatus[];
  categoryIds?: string[];
  brandIds?: string[];
  priceStatus?: PriceStatus;
  condition?: ProductCondition;
  /** Inclusive variant price range (Decimal(12,2) strings). */
  minPrice?: string;
  maxPrice?: string;
  /** Aggregate-stock bucket: IN_STOCK (onHand > 0) or OUT_OF_STOCK (0/absent). */
  stockStatus?: 'IN_STOCK' | 'OUT_OF_STOCK';
  sortBy?: CatalogGridSortField;
  sortDir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export type CatalogGridSortField =
  | 'name'
  | 'sku'
  | 'price'
  | 'discountedPrice'
  | 'createdAt'
  | 'stock';

export type CatalogGridListResponse = PaginatedResult<CatalogGridRow>;

/** Distinct product ids matching the current grid filters (select-all scope). */
export interface CatalogGridIdsResponse {
  productIds: string[];
  productCount: number;
  variantCount: number;
  /** True when the server capped the result (never silently partial). */
  truncated: boolean;
}

export interface CatalogGridBatchRowInput {
  variantId: string;
  /** ISO datetime the admin loaded the row with; the write is conditional on it. */
  expectedUpdatedAt: string;
  /** Regular/base price in Rial. */
  regularPrice?: string;
  /** Promotional selling price; null clears it. */
  discountedPrice?: string | null;
  discountStartsAt?: string | null;
  discountEndsAt?: string | null;
  /** B2B partner price; null clears it. */
  partnerPrice?: string | null;
  /** Admin-only AED regular price; converted with the current manual rate. */
  aedPrice?: string | null;
  /** Admin-only USD regular price; converted with the current manual rate. */
  usdPrice?: string | null;
  priceStatus?: PriceStatus;
  /** Absolute desired quantityOnHand in the variant's single qualifying warehouse. */
  stock?: number;
  sku?: string;
  barcode?: string | null;
  variantName?: string | null;
  /** SS-270 product-level fields. Any of these requires
   * `expectedProductUpdatedAt` (validated in the service). */
  productName?: string;
  /** Pass null to clear the brand (mirrors PATCH /admin/products). */
  brandId?: string | null;
  categoryId?: string;
  expectedProductUpdatedAt?: string;
}

export interface CatalogGridProductResult {
  updatedAt: string;
  name: string;
  brandId: string | null;
  brandName: string | null;
  categoryId: string;
  categoryName: string;
}

export interface CatalogGridBatchInput {
  rows: CatalogGridBatchRowInput[];
}

/**
 * Per-row outcomes. HTTP 409/422 semantics live at row level because a single
 * request can mix successes and failures (partial success contract).
 */
export type CatalogGridRowOutcome =
  | 'SUCCESS'
  | 'VALIDATION_ERROR'
  | 'CONFLICT_CHANGED'
  | 'CONFLICT_LOCKED'
  | 'NOT_FOUND';

export interface CatalogGridRowResult {
  variantId: string;
  outcome: CatalogGridRowOutcome;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Authoritative values on SUCCESS — the admin reconciles its drafts from these. */
  updatedAt?: string;
  regularPrice?: string;
  discountedPrice?: string | null;
  discountStartsAt?: string | null;
  discountEndsAt?: string | null;
  partnerPrice?: string | null;
  effectivePrice?: string | null;
  priceUpdatedAt?: string | null;
  stock?: number;
  sku?: string;
  barcode?: string | null;
  variantName?: string | null;
  priceStatus?: PriceStatus;
  /** Authoritative product values on SUCCESS (SS-270). */
  product?: CatalogGridProductResult;
}

export interface CatalogGridBatchResponse {
  results: CatalogGridRowResult[];
  summary: { succeeded: number; failed: number };
}
