import type { PaginatedResult } from '../api/pagination';
import type { PriceStatus, ProductStatus } from './type';

/**
 * SS-257 admin catalog grid (v1). One editable row = one ProductVariant.
 * Price/compareAtPrice/priceStatus live on the variant; `stock` is the
 * aggregate quantityOnHand across qualifying warehouses (never persisted —
 * same derivation as the inventory read API). `expectedUpdatedAt` is the
 * optimistic-concurrency token the admin echoes back on batch save.
 */
export interface CatalogGridRow {
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  sku: string;
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
  search?: string;
  sku?: string;
  status?: ProductStatus;
  categoryId?: string;
  brandId?: string;
  page?: number;
  limit?: number;
}

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
}

export interface CatalogGridBatchResponse {
  results: CatalogGridRowResult[];
  summary: { succeeded: number; failed: number };
}
