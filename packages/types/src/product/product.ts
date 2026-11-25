import type {
  PriceStatus,
  ProductCondition,
  ProductMediaType,
  ProductStatus,
} from './type';

export interface CategorySummary {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  isVisible: boolean;
  /** Public editorial category image URL; null/undefined uses the derived cover. */
  imageUrl?: string | null;
}

export interface CategoryDetail extends CategorySummary {
  children: CategorySummary[];
}

export interface CategoryTreeNode extends CategorySummary {
  productCount: number;
  children: CategoryTreeNode[];
}

export interface BrandSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isFeatured: boolean;
  /** English display name (SS-203); null when never set. */
  nameEn: string | null;
}

export interface VariantSummary {
  id: string;
  productId: string;
  sku: string;
  barcode: string | null;
  name: string | null;
  /** Regular/base price in Rial. */
  price: string;
  /** Promotional selling price in Rial; null when no product sale. */
  discountedPrice: string | null;
  /** Optional sale window (ISO). */
  discountStartsAt?: string | null;
  discountEndsAt?: string | null;
  /** B2B partner price in Rial (admin-only). */
  partnerPrice?: string | null;
  /** Last price/rate calculation timestamp. */
  priceUpdatedAt?: string | null;
  priceStatus: PriceStatus;
  /** Operator-entered source currency (SS-900 Part II). */
  priceSourceCurrency?: 'RIAL' | 'USD' | 'AED';
  /** Source amount for the regular price; null for legacy rows. */
  priceSourceAmount?: string | null;
  /** Source amount for the discounted price; null when absent. */
  discountSourceAmount?: string | null;
  /** Manual Rial-per-unit rate snapshot used for the derived Rial price. */
  priceSourceRate?: string | null;
  priceSourceRateAt?: string | null;
}

export interface ProductMediaSummary {
  id: string;
  productId: string;
  variantId: string | null;
  mediaType: ProductMediaType;
  originalName: string;
  /** Stored derivative MIME (image/png after local background removal). */
  mimeType: string;
  /** Size of the stored (watermarked/processed) asset. */
  sizeBytes: number;
  /** Origin URL for bulk-imported bytes (SS-204); null for admin uploads. */
  sourceUrl: string | null;
  /** SHA-256 hex of the received source bytes (SS-204); null pre-backfill. */
  contentHash: string | null;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: string;
  /** SS-900 processing/preview state. */
  originalUrl: string | null;
  originalMimeType: string | null;
  originalSizeBytes: number | null;
  originalWidth: number | null;
  originalHeight: number | null;
  width: number | null;
  height: number | null;
  processingStatus: 'NONE' | 'PENDING' | 'PROCESSED' | 'SKIPPED' | 'FAILED';
  processingError: string | null;
  processingModel: string | null;
  processedAt: string | null;
  backgroundRemoved: boolean;
  canRestore: boolean;
}

export interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  condition: ProductCondition;
  status: ProductStatus;
  /** Null for genuinely unbranded products (Q2 SS-207: no synthetic brand). */
  brand: BrandSummary | null;
  category: CategorySummary;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  /** Plain text up to 500 chars. */
  shortDescription: string | null;
  /**
   * Rich-text long description. Persisted as allowlist-sanitized HTML (the
   * API sanitizes before storage); render it directly (never as plain text) to
   * display the admin-authored formatting safely.
   */
  description: string | null;
  /** Null for genuinely unbranded products (Q2 SS-207: no synthetic brand). */
  brand: BrandSummary | null;
  category: CategorySummary;
  warranty: string | null;
  condition: ProductCondition;
  status: ProductStatus;
  weightKg: string | null;
  widthCm: string | null;
  heightCm: string | null;
  depthCm: string | null;
  originCountry: string | null;
  variants: VariantSummary[];
  media: ProductMediaSummary[];
  createdAt: string;
  updatedAt: string;
}
