import type { PaginatedResult } from '../api/pagination';
import type { PriceStatus, ProductCondition, ProductStatus } from './type';

/**
 * SS-257 admin catalog grid. One editable row = one ProductVariant.
 * Price/compareAtPrice/priceStatus/sku/barcode/name live on the variant;
 * `stock` is the aggregate quantityOnHand across qualifying warehouses
 * (never persisted — same derivation as the inventory read API).
 * `expectedUpdatedAt` is the optimistic-concurrency token the admin echoes
 * back on batch save. Product-level fields (productName/productStatus/
 * condition/createdAt/brand/category) are display-only: they are edited via
 * the row action (edit page), never inline, because a product can span
 * several variant rows.
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
  categoryName: string;
  thumbnailUrl: string | null;
  priceStatus: PriceStatus;
  price: string;
  compareAtPrice: string | null;
  stock: number;
  /** Inline stock editing allowed only when exactly one qualifying warehouse holds the variant. */
  stockEditable: boolean;
  expectedUpdatedAt: string;
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
  | 'compareAtPrice'
  | 'createdAt'
  | 'stock';

export type CatalogGridListResponse = PaginatedResult<CatalogGridRow>;

export interface CatalogGridBatchRowInput {
  variantId: string;
  /** ISO datetime the admin loaded the row with; the write is conditional on it. */
  expectedUpdatedAt: string;
  price?: string;
  /** Pass null to clear the sale price. */
  compareAtPrice?: string | null;
  priceStatus?: PriceStatus;
  /** Absolute desired quantityOnHand in the variant's single qualifying warehouse. */
  stock?: number;
  sku?: string;
  barcode?: string | null;
  variantName?: string | null;
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
  price?: string;
  compareAtPrice?: string | null;
  stock?: number;
  sku?: string;
  barcode?: string | null;
  variantName?: string | null;
  priceStatus?: PriceStatus;
}

export interface CatalogGridBatchResponse {
  results: CatalogGridRowResult[];
  summary: { succeeded: number; failed: number };
}
