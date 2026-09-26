import type { PriceStatus } from '../product/type';

/**
 * Customer cart contract (SS-232).
 *
 * The cart is per-user private state behind `JwtAuthGuard` — one cart per
 * authenticated user, lines keyed by variant (CART-001). Money is Rial
 * verbatim (SS-207 "O-1"), serialized as Decimal strings; the storefront
 * presents Toman via `lib/currency.ts`.
 *
 * Price semantics (CART-003/004): `unitPrice` is the LIVE variant price and
 * the only line truth; `unitPriceAtAdd` is the add-time snapshot kept for
 * display ("price changed" notice). Totals are always server-computed —
 * the client never sends prices.
 */
export interface CartItemDto {
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  variantSku: string;
  variantName: string | null;
  quantity: number;
  /** Live variant price in Rial (Decimal string) — the line truth. */
  unitPrice: string;
  /** Add-time price snapshot in Rial (Decimal string) — display only. */
  unitPriceAtAdd: string;
  /** `unitPrice × quantity` in Rial (Decimal string), server-computed. */
  lineTotal: string;
  /** True when the live price drifted from the add-time snapshot. */
  priceChanged: boolean;
  priceStatus: PriceStatus;
  /** `deriveAvailable(onHand, reserved)` across active warehouses. */
  available: number;
  inStock: boolean;
  /** Server-provided primary image URL; null when the product has none. */
  primaryImageUrl: string | null;
  /** ISO timestamp of when the line was first added. */
  addedAt: string;
}

export interface CartResponse {
  items: CartItemDto[];
  totalQuantity: number;
  /** Sum of visible line totals in Rial (Decimal string). */
  subtotal: string;
}

export interface AddCartItemInput {
  /** Concrete variant to add. Exactly one of variantId/productId is required. */
  variantId?: string;
  /** Quick-add: resolves server-side to the default purchasable variant. */
  productId?: string;
  quantity: number;
}

export interface UpdateCartItemInput {
  quantity: number;
}

export interface RemoveCartItemResponse {
  removed: boolean;
}

export interface ClearCartResponse {
  cleared: boolean;
}
