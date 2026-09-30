import type { ShipmentStatus, ShippingMethodCode } from '@sabz/types'

/**
 * Local Persian labels (SS-241). The admin keeps runtime label maps in
 * `lib/*-labels.ts` (partner-labels pattern) and imports only *types* from
 * `@sabz/types`: the package ships a CJS dist, which Vite dev serves raw
 * via /@fs where named ESM imports fail at runtime.
 */
export const SHIPPING_METHOD_LABELS: Record<ShippingMethodCode, string> = {
  TIPAX: 'تیپاکس',
  IRAN_POST: 'پست ایران',
  LOCAL_DELIVERY: 'ارسال درون‌شهری ساری',
  STORE_PICKUP: 'تحویل حضوری از فروشگاه',
}

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  PENDING: 'در انتظار ارسال',
  PICKED_UP: 'تحویل به باربری',
  IN_TRANSIT: 'در مسیر',
  OUT_FOR_DELIVERY: 'در حال توزیع',
  DELIVERED: 'تحویل به گیرنده',
  CANCELLED: 'لغو ارسال',
}

/** Timeline order for the shipment progress display. */
export const SHIPMENT_STATUS_ORDER: ShipmentStatus[] = [
  'PENDING',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
]

/** Legal manual operator moves per status (mirrors the API guard). */
export const SHIPMENT_NEXT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  PENDING: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
}
