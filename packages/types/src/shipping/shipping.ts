/**
 * Shipment + tracking contract (SS-241, master plan §6 Stage 3).
 *
 * No carrier credentials exist in-repo, so Tipax/Post are honest stubs:
 * the method catalogue is env-driven (enabled flags + flat Rial fees) and
 * tracking numbers are operator-entered. No external HTTP calls in SS-241.
 * Money stays Rial verbatim (SS-207 "O-1"), serialized as Decimal strings.
 */

import type { ShippingMethodCode } from '../orders/orders';

export type { ShippingMethodCode };

/** Shipment lifecycle: PENDING at order creation, advanced by operators. */
export type ShipmentStatus =
  | 'PENDING'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

export const SHIPMENT_STATUS_FA: Record<ShipmentStatus, string> = {
  PENDING: 'در انتظار ارسال',
  PICKED_UP: 'تحویل به باربری',
  IN_TRANSIT: 'در مسیر',
  OUT_FOR_DELIVERY: 'در حال توزیع',
  DELIVERED: 'تحویل به گیرنده',
  CANCELLED: 'لغو ارسال',
};

export const SHIPPING_METHOD_FA: Record<ShippingMethodCode, string> = {
  TIPAX: 'تیپاکس',
  IRAN_POST: 'پست ایران',
  LOCAL_DELIVERY: 'ارسال درون‌شهری ساری',
  STORE_PICKUP: 'تحویل حضوری از فروشگاه',
};

export interface TrackingEventDto {
  id: string;
  status: ShipmentStatus;
  statusFa: string;
  location: string | null;
  note: string | null;
  createdAt: string;
}

export interface ShipmentDto {
  id: string;
  orderId: string;
  method: ShippingMethodCode;
  methodFa: string;
  trackingNumber: string | null;
  status: ShipmentStatus;
  statusFa: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  events: TrackingEventDto[];
}

export interface UpdateShipmentInput {
  /** Operator-entered carrier tracking number (empty string clears). */
  trackingNumber?: string;
  /** Operator status advance (forward moves plus CANCELLED). */
  status?: ShipmentStatus;
}

export interface AddTrackingEventInput {
  status: ShipmentStatus;
  location?: string;
  note?: string;
}
