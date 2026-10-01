import type { NotificationType } from '@sabz/types'

/**
 * Local Persian labels (SS-243). The admin keeps runtime label maps in
 * `lib/*-labels.ts` (order-labels pattern) and imports only *types* from
 * `@sabz/types`: the package ships a CJS dist, which Vite dev serves raw
 * via /@fs where named ESM imports fail at runtime.
 */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  ORDER_PLACED: 'ثبت سفارش',
  ORDER_STATUS_CHANGED: 'تغییر وضعیت سفارش',
  SHIPMENT_UPDATED: 'به‌روزرسانی مرسوله',
  RETURN_REQUESTED: 'درخواست مرجوعی',
  RETURN_STATUS_CHANGED: 'تغییر وضعیت مرجوعی',
  RFQ_CREATED: 'ثبت استعلام',
  RFQ_QUOTED: 'قیمت‌گذاری استعلام',
  RFQ_DECIDED: 'تعیین تکلیف استعلام',
  PARTNER_SUBMITTED: 'ثبت درخواست همکاری',
  PARTNER_APPROVED: 'تأیید همکاری',
  PARTNER_REJECTED: 'رد همکاری',
}

export const NOTIFICATION_TYPE_ORDER: NotificationType[] = [
  'ORDER_PLACED',
  'ORDER_STATUS_CHANGED',
  'SHIPMENT_UPDATED',
  'RETURN_REQUESTED',
  'RETURN_STATUS_CHANGED',
  'RFQ_CREATED',
  'RFQ_QUOTED',
  'RFQ_DECIDED',
  'PARTNER_SUBMITTED',
  'PARTNER_APPROVED',
  'PARTNER_REJECTED',
]
