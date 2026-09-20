import type { PriceStatus, ProductCondition, ProductMediaType } from '../product/type';

/**
 * Public catalog contract (Milestone 2, SS-119).
 *
 * These types describe the read-only, unauthenticated `/catalog/*` API that
 * the customer storefront consumes. Binding rules:
 * - Only PUBLISHED, non-deleted products and visible, non-deleted categories
 *   are ever exposed.
 * - Prices are Toman, persisted as Prisma `Decimal` and serialized as strings.
 * - Media URLs are server-provided (`/api/v1/catalog/media/...` or absolute);
 *   storage keys are never exposed.
 * - Availability is derived from the inventory read aggregate (SS-112), the
 *   single source since SS-130 removed the legacy variant stock projection.
 */

/** Whitelisted sort options for `GET /catalog/products`. */
export type CatalogProductSort = 'newest' | 'price_asc' | 'price_desc' | 'name';

export interface CatalogListQuery {
  page?: number;
  limit?: number;
  /** Free-text search over product names. */
  q?: string;
  /** Category slug filter. */
  category?: string;
  /** Brand slug filter. */
  brand?: string;
  condition?: ProductCondition;
  sort?: CatalogProductSort;
}

/** Visible category with the number of published products it (directly) holds. */
export interface CatalogCategoryNode {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  publishedProductCount: number;
  children: CatalogCategoryNode[];
}

export interface CatalogBrandDto {
  id: string;
  name: string;
  slug: string;
}

/** Minimal brand/category reference embedded in product DTOs. */
export interface CatalogRefDto {
  name: string;
  slug: string;
}

/**
 * Listing-card projection of a published product. `priceFrom` is the minimum
 * *PRICED* variant price in Toman (Decimal serialized as string); CALL_FOR_PRICE
 * variants never contribute. `callForPrice` is true when no variant is PRICED.
 */
export interface CatalogProductCardDto {
  id: string;
  name: string;
  slug: string;
  condition: ProductCondition;
  brand: CatalogRefDto;
  category: CatalogRefDto;
  priceFrom: string;
  /** True when no live variant is PRICED: show call-for-price, never a price. */
  callForPrice: boolean;
  /** Number of live variants; drives the «از» (from) prefix honesty. */
  variantCount: number;
  /** True when at least one variant has available stock in active warehouses. */
  inStock: boolean;
  /** Primary image URL; null when the product has no image media. */
  primaryImageUrl: string | null;
  /** Thumbnail derivative of the primary image (SS-129); null until generated. */
  primaryThumbnailUrl: string | null;
}

export interface CatalogProductMediaDto {
  id: string;
  mediaType: ProductMediaType;
  /** Public URL of the stored (watermarked) asset. */
  url: string;
  /** Thumbnail derivative (SS-129); null for videos and until generated. */
  thumbnailUrl: string | null;
  isPrimary: boolean;
  sortOrder: number;
}

export interface CatalogProductVariantDto {
  id: string;
  sku: string;
  name: string | null;
  /** Variant price in Toman (Decimal serialized as string). */
  price: string;
  /** Pre-discount reference price (SS-201); null when no sale. */
  compareAtPrice: string | null;
  priceStatus: PriceStatus;
  /** Available stock for this variant across active warehouses. */
  inStock: boolean;
}

/** One hop of the category ancestry chain, root first. */
export interface CatalogCategoryCrumb {
  name: string;
  slug: string;
}

/** Full public projection of a published product. */
export interface CatalogProductDetailDto {
  id: string;
  name: string;
  slug: string;
  /** Plain text up to 500 chars. */
  shortDescription: string | null;
  /**
   * Rich-text long description, persisted as allowlist-sanitized HTML by the
   * API; render via the storefront RichText component only.
   */
  description: string | null;
  condition: ProductCondition;
  warranty: string | null;
  weightKg: string | null;
  widthCm: string | null;
  heightCm: string | null;
  depthCm: string | null;
  originCountry: string | null;
  brand: CatalogRefDto;
  /** Leaf category of the product. */
  category: CatalogRefDto;
  /** Ancestry chain from root to the leaf category, root first. */
  categoryBreadcrumb: CatalogCategoryCrumb[];
  variants: CatalogProductVariantDto[];
  media: CatalogProductMediaDto[];
  /** True when at least one variant has available stock in active warehouses. */
  inStock: boolean;
  createdAt: string;
}
