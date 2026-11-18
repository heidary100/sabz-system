/**
 * Customer checkout + orders contract (SS-233).
 *
 * Money is Rial verbatim (SS-207 "O-1"), serialized as Decimal strings; the
 * storefront presents Toman via `lib/currency.ts`. Prices are always
 * server-computed from live variant rows (CART-004) — the client sends only
 * `addressId` + `paymentMethod`, never money.
 *
 * Status is the v1 subset PENDING → PROCESSING → SHIPPED → DELIVERED plus
 * CANCELLED (spec lifecycle minus payment/returns stages, owned by SS-234 /
 * SS-242). Customers may only move PENDING → CANCELLED; operators own the
 * rest (SS-240).
 */

export type OrderStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

export type PaymentMethod = 'ONLINE' | 'COD';

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED';

export const ORDER_STATUS_FA: Record<OrderStatus, string> = {
  PENDING: 'در انتظار بررسی',
  PROCESSING: 'در حال آماده‌سازی',
  SHIPPED: 'ارسال شده',
  DELIVERED: 'تحویل شده',
  CANCELLED: 'لغو شده',
};

export const PAYMENT_METHOD_FA: Record<PaymentMethod, string> = {
  ONLINE: 'پرداخت آنلاین',
  COD: 'پرداخت در محل',
};

export const PAYMENT_STATUS_FA: Record<PaymentStatus, string> = {
  PENDING: 'در انتظار پرداخت',
  PAID: 'پرداخت شده',
  FAILED: 'پرداخت ناموفق',
};

export type ShippingMethodCode =
  | 'TIPAX'
  | 'IRAN_POST'
  | 'LOCAL_DELIVERY'
  | 'STORE_PICKUP';

export interface ShippingMethodDto {
  code: ShippingMethodCode;
  titleFa: string;
  etaFa: string;
  /** Rial (Decimal string); env-driven flat fee (SS-241), "0" when unset. */
  fee: string;
  /**
   * Server-driven availability (SS-241): false while the method is stubbed
   * behind its env flag — the storefront disables instead of hiding.
   */
  enabled: boolean;
}

export interface PaymentMethodDto {
  code: PaymentMethod;
  titleFa: string;
  descFa: string;
  /**
   * Server-driven availability (SS-234 COD-only): false while the method is
   * stubbed behind its env flag — the storefront disables instead of hiding.
   */
  enabled: boolean;
}

export type CheckoutProblemCode =
  | 'OUT_OF_STOCK'
  | 'PRICE_CHANGED'
  | 'UNPUBLISHED'
  | 'CALL_FOR_PRICE';

export interface CheckoutProblemDto {
  variantId: string;
  code: CheckoutProblemCode;
  message: string;
  /** Available units for OUT_OF_STOCK / PRICE_CHANGED; null otherwise. Always present so e2e key pins stay exact. */
  available: number | null;
}

export interface CheckoutLineDto {
  variantId: string;
  productName: string;
  variantSku: string;
  quantity: number;
  /** Live variant price in Rial (Decimal string) — the line truth. */
  unitPrice: string;
  lineTotal: string;
  priceChanged: boolean;
  available: number;
  inStock: boolean;
}

export interface CheckoutSummaryDto {
  valid: boolean;
  items: CheckoutLineDto[];
  /** Rial (Decimal string), server-computed and rounded for payment. */
  subtotal: string;
  shippingFee: string;
  total: string;
  problems: CheckoutProblemDto[];
  /** Checkout identity requirement (SS-900). Full value is never returned. */
  nationalId: {
    required: true;
    hasNationalId: boolean;
    maskedNationalId: string | null;
  };
  /** Customer note draft is accepted at placement, not here. */
  noteMaxLength: number;
}

export interface PlaceOrderInput {
  addressId: string;
  paymentMethod: PaymentMethod;
  /** Shipping method code (SS-241): fee resolves server-side. */
  shippingMethod: ShippingMethodCode;
  /** Optional plain-text order note (SS-900), max 1000 chars. */
  note?: string;
  /**
   * Personal national ID (کد ملی) supplied at checkout. Required when the
   * profile has none; validated server-side (10 digits + checksum) and never
   * logged. The API stores a snapshot and updates the profile.
   */
  nationalId?: string;
  /** Optional online provider selection; credentials stay server-side. */
  paymentProvider?: 'SNAPPAY' | 'DIGIPAY';
}

export interface PlaceOrderResult {
  orderId: string;
  orderNumber: number;
  status: OrderStatus;
  total: string;
}

/** Address columns frozen at order creation (ORDER-003). */
export interface OrderAddressSnapshot {
  fullName: string;
  phone: string;
  province: string | null;
  city: string | null;
  address: string;
  postalCode: string | null;
}

export interface OrderItemDto {
  /** Order-line id (SS-242: referenced by return-request items). */
  id: string;
  variantId: string;
  productName: string;
  variantName: string | null;
  sku: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface OrderListItemDto {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  statusFa: string;
  itemCount: number;
  total: string;
  createdAt: string;
}

export interface OrderListResponse {
  items: OrderListItemDto[];
  total: number;
}

export interface OrderDetailDto {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  statusFa: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  subtotal: string;
  /** Chosen shipping method code (SS-241). */
  shippingMethod: ShippingMethodCode;
  shippingFee: string;
  total: string;
  /** Shipment + tracking timeline; null for pre-SS-241 orders. */
  shipment: import('../shipping/shipping').ShipmentDto | null;
  addressSnapshot: OrderAddressSnapshot;
  items: OrderItemDto[];
  /** Customer order note (plain text); null when none submitted. */
  note: string | null;
  /** Masked national ID snapshot for display; the full value is ADMIN-only. */
  customerNationalIdMasked: string | null;
  createdAt: string;
}

/**
 * Admin order list row (SS-240A). Same row as the customer list plus the
 * owner reference and customer mobile so operators can triage without a
 * second lookup. Money stays Rial (Decimal strings); the admin UI labels
 * Toman like the variant form.
 */
export interface AdminOrderListItemDto extends OrderListItemDto {
  userId: string;
  customerMobile: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
}

export interface AdminOrderListResponse {
  items: AdminOrderListItemDto[];
  total: number;
}

/** Admin order detail (SS-240A): full customer detail + owner + mobile. */
export interface AdminOrderDetailDto extends OrderDetailDto {
  userId: string;
  customerMobile: string;
}

/** Operator status input (SS-240A). Terminal states are never accepted. */
export type AdminOrderTransition =
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

/** Invoice data for the HTML print route (SS-233 v1 — no PDF dep). */
export interface InvoiceDto {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  statusFa: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  subtotal: string;
  shippingFee: string;
  total: string;
  addressSnapshot: OrderAddressSnapshot;
  items: OrderItemDto[];
  note: string | null;
  customerNationalIdMasked: string | null;
  createdAt: string;
  customerMobile: string;
}
