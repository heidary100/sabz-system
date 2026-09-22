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
  /**
   * Minimum priced-variant price in Toman (API Decimal-as-string, SS-213).
   * A product matches when at least one PRICED, live variant has
   * `price >= priceFrom`. CALL_FOR_PRICE rows never contribute.
   */
  priceFrom?: string;
  /**
   * Maximum priced-variant price in Toman (API Decimal-as-string, SS-213).
   * A product matches when at least one PRICED, live variant has
   * `price <= priceTo`. With both bounds present, the SAME variant must
   * satisfy the range.
   */
  priceTo?: string;
  /**
   * When true, only products with at least one genuinely available variant
   * (`deriveAvailable(quantityOnHand, quantityReserved) > 0` under
   * `activeInventoryWhere`) are returned (SS-213).
   */
  inStockOnly?: boolean;
}

/** Visible category with the published-product count of its whole subtree (SS-205 roll-up). */
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
  /** Null for genuinely unbranded products (Q2 SS-207: no synthetic brand). */
  brand: CatalogRefDto | null;
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

/** Ordered display spec (SS-202): attribute/value pair with grouping. */
export interface CatalogProductSpecDto {
  attributeName: string;
  attributeSlug: string;
  /** Woo dotted-namespace group (e.g. مشخصات کلی); null when ungrouped. */
  attributeGroup: string | null;
  value: string;
  valueSlug: string;
  sortOrder: number;
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
  /** English display name for mixed FA/EN rendering (SS-203). */
  nameEn: string | null;
  /** Secondary title line (SS-203). */
  subtitle: string | null;
  /** Plain text up to 500 chars. */
  shortDescription: string | null;
  /**
   * Rich-text long description, persisted as allowlist-sanitized HTML by the
   * API; render via the storefront RichText component only.
   */
  description: string | null;
  condition: ProductCondition;
  warranty: string | null;
  /** Public SEO title/description (SS-203); consumed by storefront metadata. */
  metaTitle: string | null;
  metaDescription: string | null;
  weightKg: string | null;
  widthCm: string | null;
  heightCm: string | null;
  depthCm: string | null;
  originCountry: string | null;
  /** Null for genuinely unbranded products (Q2 SS-207: no synthetic brand). */
  brand: CatalogRefDto | null;
  /** Leaf category of the product. */
  category: CatalogRefDto;
  /** Ancestry chain from root to the leaf category, root first. */
  categoryBreadcrumb: CatalogCategoryCrumb[];
  variants: CatalogProductVariantDto[];
  media: CatalogProductMediaDto[];
  /** Ordered display specs (SS-202); empty when the product has none. */
  specs: CatalogProductSpecDto[];
  /** Ordered tags (SS-203); empty when the product has none. */
  tags: CatalogRefDto[];
  /** True when at least one variant has available stock in active warehouses. */
  inStock: boolean;
  createdAt: string;
}
