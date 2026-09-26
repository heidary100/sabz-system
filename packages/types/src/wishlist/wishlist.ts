import type { CatalogProductCardDto } from '../catalog/catalog';

/**
 * Customer wishlist contract (SS-231).
 *
 * The wishlist is per-user private state behind `JwtAuthGuard` — no public
 * reads, no pagination v1 (user-bounded, tens of rows). Each item reuses
 * `CatalogProductCardDto` verbatim plus the save timestamp, so the
 * storefront renders wishlist rows with the existing `ProductCard` and the
 * single Rial→Toman conversion point (`lib/currency.ts`) without mapping.
 */
export interface WishlistItemDto extends CatalogProductCardDto {
  /** ISO timestamp of when the product was saved. */
  addedAt: string;
}

export interface WishlistListResponse {
  items: WishlistItemDto[];
  total: number;
}

export interface AddWishlistInput {
  productId: string;
}

export interface RemoveWishlistResponse {
  removed: boolean;
}
