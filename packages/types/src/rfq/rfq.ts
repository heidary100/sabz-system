/**
 * Request-for-quotation contract (SS-235 B2, pricing-engine.md §6 + §8).
 *
 * Only APPROVED partners may file, and only against CALL_FOR_PRICE
 * variants (PRICE-008). Money is Rial verbatim (SS-207 "O-1"), serialized
 * as Decimal strings; the storefront presents Toman via `lib/currency.ts`.
 * The operator quote is the price agreement — accept freezes
 * `quotedUnitPrice` into an order, never re-resolving through the pricing
 * engine.
 */

export type RfqStatus =
  | 'PENDING'
  | 'QUOTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED';

export const RFQ_STATUS_FA: Record<RfqStatus, string> = {
  PENDING: 'در انتظار استعلام',
  QUOTED: 'قیمت اعلام شد',
  ACCEPTED: 'پذیرفته شد',
  REJECTED: 'رد شد',
  EXPIRED: 'منقضی شد',
};

export interface CreateRfqInput {
  variantId: string;
  quantity: number;
}

export interface QuoteRfqInput {
  /** Rial unit price (Decimal string), must be > 0. */
  unitPrice: string;
  /** Optional ISO expiry override; must be in the future. */
  expiresAt?: string;
}

export interface AcceptRfqInput {
  addressId: string;
  paymentMethod: 'ONLINE' | 'COD';
  /** Shipping method code (SS-241): fee resolves server-side. */
  shippingMethod: import('../orders/orders').ShippingMethodCode;
}

export interface RfqDto {
  id: string;
  variantId: string;
  productSlug: string;
  productName: string;
  variantSku: string;
  quantity: number;
  status: RfqStatus;
  statusFa: string;
  /** Rial (Decimal string); null until QUOTED. */
  quotedUnitPrice: string | null;
  /** Rial line total (quotedUnitPrice × quantity); null until QUOTED. */
  quotedLineTotal: string | null;
  expiresAt: string;
  orderId: string | null;
  createdAt: string;
}

export interface RfqListResponse {
  items: RfqDto[];
  total: number;
}
