import type {
  AdminOrderTransition,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '@sabz/types'

/**
 * Local Persian labels (SS-240A). The admin keeps runtime label maps in
 * `lib/*-labels.ts` (partner-labels pattern) and imports only *types* from
 * `@sabz/types`: the package ships a CJS dist, which Vite dev serves raw
 * via /@fs where named ESM imports fail at runtime.
 */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'در انتظار بررسی',
  PROCESSING: 'در حال آماده‌سازی',
  SHIPPED: 'ارسال شده',
  DELIVERED: 'تحویل شده',
  CANCELLED: 'لغو شده',
}

export const ORDER_PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  ONLINE: 'پرداخت آنلاین',
  COD: 'پرداخت در محل',
}

export const ORDER_PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'در انتظار پرداخت',
  PAID: 'پرداخت شده',
  FAILED: 'پرداخت ناموفق',
}

export const ORDER_STATUS_ORDER: OrderStatus[] = [
  'PENDING',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
]

/** Legal operator moves per status (mirrors the API lifecycle guard). */
export const ORDER_NEXT_TRANSITIONS: Record<OrderStatus, AdminOrderTransition[]> = {
  PENDING: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
}

export const ORDER_TRANSITION_LABELS: Record<AdminOrderTransition, string> = {
  PROCESSING: 'شروع آماده‌سازی',
  SHIPPED: 'ثبت ارسال',
  DELIVERED: 'ثبت تحویل (تسویه COD)',
  CANCELLED: 'لغو سفارش',
}

export const ORDER_TRANSITION_DESCRIPTIONS: Record<AdminOrderTransition, string> = {
  PROCESSING: 'سفارش وارد مرحله آماده‌سازی می‌شود.',
  SHIPPED: 'سفارش ارسال‌شده ثبت می‌شود.',
  DELIVERED:
    'تحویل سفارش ثبت می‌شود؛ مبلغ سفارش‌های پرداخت در محل در همین مرحله تسویه‌شده محسوب می‌شود.',
  CANCELLED:
    'سفارش لغو و موجودی مصرف‌شده به انبار بازمی‌گردد. این عمل قابل بازگشت نیست.',
}
